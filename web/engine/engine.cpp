#include "appdraw/AdornG3D.h"
#include "browser_input.h"
#include "browser_window.h"
#include "humanoid/Humanoid.h"
#include "network/API.h"
#include "network/Client.h"
#include "network/Player.h"
#include "network/Players.h"
#include "network/Replicator.h"
#include "rbxview/View.h"
#include "script/ScriptContext.h"
#include "util/ContentProvider.h"
#include "util/IMetric.h"
#include "util/StandardOut.h"
#include "util/UIEvent.h"
#include "v8datamodel/Camera.h"
#include "v8datamodel/DataModel.h"
#include "v8datamodel/PartInstance.h"
#include "v8datamodel/TimeState.h"
#include "v8datamodel/UserController.h"
#include "v8datamodel/Workspace.h"
#include "v8datamodel/factoryregistration.h"

#include <GLG3D/RenderDevice.h>
#include <cstring>
#include <emscripten.h>
#include <exception>
#include <sstream>
#include <vector>

static boost::shared_ptr<RBX::DataModel> model;
static std::vector<float> scene;
static float cameraFrame[12];
static float characterPosition[3];
static std::unique_ptr<G3D::RenderDevice> renderDevice;
static std::unique_ptr<BrowserWindow> renderWindow;
static std::unique_ptr<RBX::View::View> originalView;
static std::unique_ptr<RBX::AdornG3D> adorn;

class BrowserMetric : public RBX::IMetric
{
public:
	virtual std::string getMetric(const std::string& name) const
	{
		if (name == "graphicsMode") {
			return "Original OpenGL / WebAssembly";
		}
		if (name == "GfxTime" && originalView) {
			std::ostringstream value;
			value << originalView->getRenderStats().cpuRenderTotal.elapsedTime() * 1000 << "ms";
			return value.str();
		}
		return "unavailable";
	}
};

static BrowserMetric browserMetric;
static BrowserInput browserInput;

static void snapshot(RBX::Instance* instance)
{
	if (RBX::PartInstance* part = dynamic_cast<RBX::PartInstance*>(instance)) {
		const G3D::CoordinateFrame& frame = part->getCoordinateFrame();
		const G3D::Vector3 size = part->getPartSizeUi();
		const G3D::Color3 color = part->getColor3();
		scene.push_back(frame.translation.x);
		scene.push_back(frame.translation.y);
		scene.push_back(frame.translation.z);
		for (int column = 0; column < 3; ++column) {
			for (int row = 0; row < 3; ++row) {
				scene.push_back(frame.rotation[row][column]);
			}
		}
		scene.push_back(size.x);
		scene.push_back(size.y);
		scene.push_back(size.z);
		scene.push_back(color.r);
		scene.push_back(color.g);
		scene.push_back(color.b);
		scene.push_back(1.0f - part->getTransparencyUi());
		scene.push_back(static_cast<float>(part->getPartType()));
	}
	for (unsigned int i = 0; i < instance->numChildren(); ++i) {
		snapshot(instance->getChild(i));
	}
}

static void output(const char* text)
{
	char* copy = strdup(text);
	MAIN_THREAD_ASYNC_EM_ASM(
		{
			Module['host'].log(UTF8ToString($0));
			_free($0);
		},
		copy
	);
}

class Output : public RBX::Listener<RBX::StandardOut, RBX::StandardOutMessage>
{
	virtual void onEvent(const RBX::StandardOut*, RBX::StandardOutMessage event) { output(event.message.c_str()); }
};

static Output listener;

extern "C"
{
	EMSCRIPTEN_KEEPALIVE int rbx_engine_render_init(int width, int height)
	{
		try {
			if (!model || width < 1 || height < 1) {
				return 1;
			}
			RBX::DataModel::Lock lock(model);
			renderDevice.reset(new G3D::RenderDevice());
			renderWindow.reset(new BrowserWindow(width, height));
			renderDevice->init(renderWindow.get());
			originalView.reset(new RBX::View::View(model));
			originalView->updateSettings(50, 50, true, 1000);
			adorn.reset(new RBX::AdornG3D(renderDevice.get()));
			browserInput.init(adorn.get());
			model->buildGui(adorn.get());
			output("Original RbxView, RenderLib and GLG3D initialized");
			return 0;
		}
		catch (const std::exception& error) {
			output(error.what());
			return 1;
		}
	}

	EMSCRIPTEN_KEEPALIVE int rbx_engine_render(int width, int height)
	{
		try {
			if (!originalView || !renderDevice || !model) {
				return 1;
			}
			RBX::DataModel::Lock lock(model);
			if (width != renderDevice->getWidth() || height != renderDevice->getHeight()) {
				renderDevice->notifyResize(width, height);
			}
			renderDevice->beginFrame();
			renderDevice->setViewport(G3D::Rect2D::xywh(0, 0, width, height));
			originalView->render(renderDevice.get());
			model->renderPass3dAdorn(adorn.get());
			renderDevice->push2D();
			model->renderPass2d(adorn.get(), &browserMetric);
			renderDevice->pop2D();
			renderDevice->endFrame();
			return 0;
		}
		catch (const std::exception& error) {
			output(error.what());
			return 1;
		}
	}

	EMSCRIPTEN_KEEPALIVE const unsigned char* rbx_engine_render_pixels()
	{
		return renderWindow ? renderWindow->framebuffer() : NULL;
	}

	EMSCRIPTEN_KEEPALIVE int rbx_engine_render_triangles()
	{
		return originalView ? originalView->getRenderStats().totalTriangles : 0;
	}

	EMSCRIPTEN_KEEPALIVE void rbx_engine_key(int key, int down, int modifiers)
	{
		if (!model) {
			return;
		}
		RBX::DataModel::Lock lock(model);
		browserInput.setKeyState(static_cast<SDLKey>(key), down != 0);
		RBX::UIEvent event(
			&browserInput,
			down ? RBX::UIEvent::KEY_DOWN : RBX::UIEvent::KEY_UP,
			static_cast<SDLKey>(key),
			static_cast<SDLMod>(modifiers)
		);
		model->processGui(event);
	}

	EMSCRIPTEN_KEEPALIVE void rbx_engine_mouse(int type, int x, int y, int dx, int dy)
	{
		if (!model || !renderWindow) {
			return;
		}
		RBX::DataModel::Lock lock(model);
		browserInput.setPosition(x, y);
		renderWindow->setRelativeMousePosition(x, y);
		RBX::UIEvent event(
			&browserInput,
			static_cast<RBX::UIEvent::EventType>(type),
			G3D::Vector2int16(x, y),
			G3D::Vector2int16(renderWindow->width(), renderWindow->height())
		);
		event.mouseDelta = G3D::Vector2int16(dx, dy);
		model->processGui(event);
		if (type == RBX::UIEvent::MOUSE_MOVE && browserInput.getWrapMode() == RBX::UserInputBase::WRAP_CENTER) {
			model->getWorkspace()->onWrapMouse(G3D::Vector2(dx, dy));
		}
	}

	EMSCRIPTEN_KEEPALIVE int rbx_engine_init()
	{
		try {
			if (model) {
				return 0;
			}
			static RBX::FactoryRegistrator registration;
			RBX::Network::API::init("0, 3, 676, 0");
			RBX::StandardOut::singleton()->addListener(&listener);
			model = RBX::DataModel::createDataModel();
			browserInput.reset();
			model->create<RBX::ControllerService>()->setHardwareDevice(&browserInput);
			model->getWorkspace()->getCamera()->setCameraType(RBX::Camera::CUSTOM_CAMERA);
			model->create<RBX::ScriptContext>();
			output("Original DataModel and ScriptContext initialized");
			return 0;
		}
		catch (const std::exception& error) {
			output(error.what());
			return 1;
		}
	}

	EMSCRIPTEN_KEEPALIVE int rbx_engine_execute(const char* source)
	{
		try {
			if (!model) {
				return 1;
			}
			RBX::DataModel::Lock lock(model);
			model->create<RBX::ScriptContext>()->executeInNewThread(RBX::Security::CmdLine, source, "Browser");
			return 0;
		}
		catch (const std::exception& error) {
			output(error.what());
			return 1;
		}
	}

	EMSCRIPTEN_KEEPALIVE void rbx_engine_destroy()
	{
		adorn.reset();
		originalView.reset();
		if (renderDevice) {
			renderDevice->cleanup();
			renderDevice.reset();
		}
		renderWindow.reset();
		if (model) {
			RBX::DataModel::closeDataModel(model, true);
			model.reset();
			RBX::StandardOut::singleton()->removeListener(&listener);
		}
	}

	EMSCRIPTEN_KEEPALIVE const float* rbx_engine_snapshot()
	{
		scene.clear();
		if (model) {
			RBX::DataModel::Lock lock(model);
			snapshot(model->getWorkspace());
		}
		return scene.empty() ? NULL : &scene[0];
	}

	EMSCRIPTEN_KEEPALIVE int rbx_engine_part_count()
	{
		return static_cast<int>(scene.size() / 20);
	}

	EMSCRIPTEN_KEEPALIVE const float* rbx_engine_camera_frame()
	{
		if (!model) {
			return NULL;
		}
		RBX::DataModel::Lock lock(model);
		G3D::CoordinateFrame frame = model->getWorkspace()->getCamera()->getCameraCoordinateFrame();
		for (int i = 0; i < 3; ++i) {
			cameraFrame[i] = frame.translation[i];
		}
		for (int column = 0; column < 3; ++column) {
			for (int row = 0; row < 3; ++row) {
				cameraFrame[3 + column * 3 + row] = frame.rotation[row][column];
			}
		}
		return cameraFrame;
	}

	EMSCRIPTEN_KEEPALIVE void rbx_engine_camera(float x, float y, float z, float targetX, float targetY, float targetZ)
	{
		if (!model) {
			return;
		}
		RBX::DataModel::Lock lock(model);
		G3D::CoordinateFrame frame(G3D::Vector3(x, y, z));
		frame.lookAt(G3D::Vector3(targetX, targetY, targetZ));
		model->getWorkspace()->getCamera()->setCameraFocus(G3D::CoordinateFrame(G3D::Vector3(targetX, targetY, targetZ))
		);
		model->getWorkspace()->getCamera()->setCameraCoordinateFrameNoLerp(frame);
	}

	EMSCRIPTEN_KEEPALIVE void rbx_engine_run(int running)
	{
		if (model) {
			RBX::DataModel::Lock lock(model);
			if (running) {
				model->create<RBX::RunService>()->run();
			}
			else {
				model->create<RBX::RunService>()->pause();
			}
		}
	}

	EMSCRIPTEN_KEEPALIVE int rbx_engine_input(float forward, float right, int jump)
	{
		if (!model) {
			return 0;
		}
		RBX::DataModel::Lock lock(model);
		RBX::Humanoid* humanoid =
			RBX::Humanoid::modelIsCharacter(RBX::Network::Players::findLocalCharacter(model.get()));
		if (!humanoid) {
			return 0;
		}
		browserInput.setKeyState(SDLK_w, forward > 0);
		browserInput.setKeyState(SDLK_s, forward < 0);
		browserInput.setKeyState(SDLK_d, right > 0);
		browserInput.setKeyState(SDLK_a, right < 0);
		browserInput.setKeyState(SDLK_SPACE, jump != 0);
		return 1;
	}

	EMSCRIPTEN_KEEPALIVE int rbx_engine_request_character()
	{
		if (!model) {
			return 0;
		}
		RBX::DataModel::Lock lock(model);
		RBX::Network::Player* player = RBX::Network::Players::findLocalPlayer(model.get());
		RBX::Network::Client* client = model->find<RBX::Network::Client>();
		if (!player || !client) {
			return 0;
		}
		if (player->getCharacter()) {
			return 2;
		}
		for (unsigned int i = 0; i < client->numChildren(); ++i) {
			if (RBX::Network::Replicator* replicator = dynamic_cast<RBX::Network::Replicator*>(client->getChild(i))) {
				if (replicator->isSerializePending(player)) {
					return 0;
				}
				replicator->requestCharacter();
				return 1;
			}
		}
		return 0;
	}

	EMSCRIPTEN_KEEPALIVE const float* rbx_engine_character_position()
	{
		if (!model) {
			return NULL;
		}
		RBX::DataModel::Lock lock(model);
		RBX::Humanoid* humanoid =
			RBX::Humanoid::modelIsCharacter(RBX::Network::Players::findLocalCharacter(model.get()));
		if (!humanoid || !humanoid->getTorso()) {
			return NULL;
		}
		const G3D::Vector3 position = humanoid->getTorso()->getCoordinateFrame().translation;
		for (int i = 0; i < 3; ++i) {
			characterPosition[i] = position[i];
		}
		return characterPosition;
	}

	EMSCRIPTEN_KEEPALIVE float rbx_engine_time()
	{
		if (!model) {
			return 0;
		}
		RBX::DataModel::Lock lock(model);
		return model->getSimTime();
	}

	EMSCRIPTEN_KEEPALIVE int rbx_engine_load(const char* xml, int length)
	{
		try {
			if (!model || length < 0) {
				return 1;
			}
			RBX::DataModel::Lock lock(model);
			std::istringstream input(std::string(xml, length));
			RBX::ContentId id = RBX::ContentProvider::singleton().registerContent(input, RBX::Name::getNullName());
			model->loadContent(id);
			return 0;
		}
		catch (const std::exception& error) {
			output(error.what());
			return 1;
		}
	}

	EMSCRIPTEN_KEEPALIVE int rbx_engine_asset(const char* path, const char* bytes, int length)
	{
		if (length < 0 || path == NULL || path[0] != '/' || std::strstr(path, "..") != NULL) {
			return 1;
		}
		FILE* file = std::fopen(path, "wb");
		if (file == NULL) {
			return 1;
		}
		size_t written = std::fwrite(bytes, 1, length, file);
		std::fclose(file);
		return written == static_cast<size_t>(length) ? 0 : 1;
	}
}
