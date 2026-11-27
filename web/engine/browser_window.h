#ifndef RBX_BROWSER_WINDOW_H
#define RBX_BROWSER_WINDOW_H

#include <G3D/Rect2D.h>
#include <GLG3D/GWindow.h>
#include <GLG3D/glcalls.h>
#include <stdexcept>
#include <vector>

class BrowserWindow : public G3D::GWindow
{
	Settings settings;
	OSMesaContext context;
	std::vector<unsigned char> pixels;
	std::vector<unsigned char> displayPixels;
	G3D::Vector2 mouse;
	G3D::Array<G3D::uint16> gamma;
	std::string title;
	bool captured;
	bool visible;

protected:
	virtual void reallyMakeCurrent() const
	{
		if (!OSMesaMakeCurrent(
				context, const_cast<unsigned char*>(pixels.data()), GL_UNSIGNED_BYTE, settings.width, settings.height
			)) {
			throw std::runtime_error("OSMesaMakeCurrent failed");
		}
	}

public:
	BrowserWindow(int width, int height) : context(NULL), mouse(0, 0), captured(false), visible(true)
	{
		settings.width = width;
		settings.height = height;
		settings.rgbBits = 8;
		settings.alphaBits = 8;
		settings.depthBits = 24;
		settings.stencilBits = 8;
		settings.fsaaSamples = 0;
		settings.fullScreen = false;
		context = OSMesaCreateContextExt(OSMESA_RGBA, 24, 8, 0, NULL);
		if (context == NULL) {
			throw std::runtime_error("Cannot create the original Mesa context");
		}
		pixels.resize(width * height * 4);
		reallyMakeCurrent();
		OSMesaPixelStore(OSMESA_Y_UP, 0);
	}
	virtual ~BrowserWindow() { OSMesaDestroyContext(context); }
	const unsigned char* framebuffer()
	{
		if (gamma.size() != 256) {
			return pixels.data();
		}
		displayPixels.resize(pixels.size());
		for (size_t i = 0; i < pixels.size(); ++i) {
			displayPixels[i] = i % 4 == 3 ? pixels[i] : static_cast<unsigned char>((gamma[pixels[i]] + 128) / 257);
		}
		return displayPixels.data();
	}
	virtual void getSettings(Settings& value) const { value = settings; }
	virtual int width() const { return settings.width; }
	virtual int height() const { return settings.height; }
	virtual G3D::Rect2D dimensions() const { return G3D::Rect2D::xywh(settings.x, settings.y, width(), height()); }
	virtual void setDimensions(const G3D::Rect2D& value) { notifyResize(value.width(), value.height()); }
	virtual void setPosition(int x, int y)
	{
		settings.x = x;
		settings.y = y;
	}
	virtual bool hasFocus() const { return true; }
	virtual std::string getAPIVersion() const { return "6.5"; }
	virtual std::string getAPIName() const { return "Browser / original Mesa OSMesa"; }
	virtual void setGammaRamp(const G3D::Array<G3D::uint16>& value) { gamma = value; }
	virtual void setCaption(const std::string& value) { title = value; }
	virtual int numJoysticks() const { return 0; }
	virtual std::string joystickName(unsigned int) { return ""; }
	virtual std::string caption() { return title; }
	virtual void swapGLBuffers() { glFinish(); }
	virtual void notifyResize(int w, int h)
	{
		if (w < 1 || h < 1 || w > 1280 || h > 1024) {
			throw std::runtime_error("Browser render dimensions are out of range");
		}
		settings.width = w;
		settings.height = h;
		pixels.resize(w * h * 4);
		reallyMakeCurrent();
	}
	virtual void setRelativeMousePosition(double x, double y) { mouse = G3D::Vector2(x, y); }
	virtual void setRelativeMousePosition(const G3D::Vector2& value) { mouse = value; }
	virtual void getRelativeMouseState(G3D::Vector2& value, G3D::uint8& buttons) const
	{
		value = mouse;
		buttons = 0;
	}
	virtual void getRelativeMouseState(int& x, int& y, G3D::uint8& buttons) const
	{
		x = mouse.x;
		y = mouse.y;
		buttons = 0;
	}
	virtual void getRelativeMouseState(double& x, double& y, G3D::uint8& buttons) const
	{
		x = mouse.x;
		y = mouse.y;
		buttons = 0;
	}
	virtual void getJoystickState(unsigned int, G3D::Array<float>& axis, G3D::Array<bool>& buttons)
	{
		axis.clear();
		buttons.clear();
	}
	virtual void setInputCapture(bool value) { captured = value; }
	virtual bool inputCapture() const { return captured; }
	virtual void setMouseVisible(bool value) { visible = value; }
	virtual bool mouseVisible() const { return visible; }
};

#endif
