#include <algorithm>
#include <cstdlib>
#include <cstring>
#include <emscripten.h>
#include <fmod.hpp>
#include <map>
#include <mutex>
#include <vector>

struct FMOD_SOUND
{
	int id;
	FMOD_MODE mode;
};

struct FMOD_CHANNEL
{
	int id;
	FMOD_SOUND* sound;
	FMOD_MODE mode;
	float volume;
	bool paused;
	bool playing;
	bool started;
	void* user;
	FMOD_CHANNEL_CALLBACK callback;
	int callbackCommand;
};

struct FMOD_SYSTEM
{
	int maxChannels;
	std::vector<FMOD_CHANNEL*> channels;
};

static int nextAudioId;
static std::mutex endedMutex;
static std::vector<int> endedChannels;

static void command(
	int operation, int id, double a = 0, double b = 0, double c = 0, const char* bytes = NULL, int length = 0
)
{
	char* copy = NULL;
	if (bytes != NULL && length > 0) {
		copy = static_cast<char*>(std::malloc(length));
		if (copy == NULL) {
			return;
		}
		std::memcpy(copy, bytes, length);
	}
	MAIN_THREAD_ASYNC_EM_ASM(
		{
			const bytes = $5 ? HEAPU8.slice($5, $5 + $6) : undefined;
			if ($5) {
				_free($5);
			}
			Module['host'].audio({operation : $0, id : $1, a : $2, b : $3, c : $4, bytes});
		},
		operation,
		id,
		a,
		b,
		c,
		copy,
		length
	);
}

extern "C" EMSCRIPTEN_KEEPALIVE void rbx_engine_audio_ended(int id)
{
	std::lock_guard<std::mutex> lock(endedMutex);
	endedChannels.push_back(id);
}

extern "C" FMOD_RESULT FMOD_System_Create(FMOD_SYSTEM** system)
{
	*system = new FMOD_SYSTEM();
	(*system)->maxChannels = 100;
	return FMOD_OK;
}

extern "C" FMOD_RESULT FMOD_Memory_GetStats(int*, int*)
{
	return FMOD_ERR_UNSUPPORTED;
}

extern "C" FMOD_RESULT FMOD_Channel_GetUserData(FMOD_CHANNEL* channel, void** value)
{
	*value = channel->user;
	return FMOD_OK;
}

namespace FMOD {

FMOD_RESULT System::getVersion(unsigned int* version)
{
	*version = FMOD_VERSION;
	return FMOD_OK;
}

FMOD_RESULT System::getDriver(int* driver)
{
	*driver = 0;
	return FMOD_OK;
}

FMOD_RESULT System::getDriverName(int, char* name, int length)
{
	if (length <= 0) {
		return FMOD_ERR_INVALID_PARAM;
	}
	std::strncpy(name, "Web Audio compatibility backend", length - 1);
	name[length - 1] = 0;
	return FMOD_OK;
}

FMOD_RESULT System::getDriverCaps(int, FMOD_CAPS* caps, int* minimum, int* maximum, FMOD_SPEAKERMODE* mode)
{
	*caps = 0;
	if (minimum != NULL) {
		*minimum = 0;
	}
	if (maximum != NULL) {
		*maximum = 0;
	}
	*mode = FMOD_SPEAKERMODE_STEREO;
	return FMOD_OK;
}

FMOD_RESULT System::setSpeakerMode(FMOD_SPEAKERMODE mode)
{
	return mode == FMOD_SPEAKERMODE_STEREO ? FMOD_OK : FMOD_ERR_UNSUPPORTED;
}

FMOD_RESULT System::setDSPBufferSize(unsigned int, int)
{
	return FMOD_ERR_UNSUPPORTED;
}

FMOD_RESULT System::init(int maxChannels, FMOD_INITFLAGS, void*)
{
	reinterpret_cast<FMOD_SYSTEM*>(this)->maxChannels = maxChannels;
	return FMOD_OK;
}

FMOD_RESULT System::setReverbProperties(const FMOD_REVERB_PROPERTIES*)
{
	return FMOD_ERR_UNSUPPORTED;
}

FMOD_RESULT System::set3DSettings(float doppler, float distance, float rolloff)
{
	command(10, 0, distance, rolloff, doppler);
	return FMOD_OK;
}

FMOD_RESULT System::set3DListenerAttributes(
	int, const FMOD_VECTOR* position, const FMOD_VECTOR*, const FMOD_VECTOR* forward, const FMOD_VECTOR* up
)
{
	if (position != NULL) {
		command(7, 0, position->x, position->y, position->z);
	}
	if (forward != NULL) {
		command(11, 0, forward->x, forward->y, forward->z);
	}
	if (up != NULL) {
		command(12, 0, up->x, up->y, up->z);
	}
	return FMOD_OK;
}

FMOD_RESULT System::createSound(const char* data, FMOD_MODE mode, FMOD_CREATESOUNDEXINFO* info, Sound** sound)
{
	if (!(mode & FMOD_OPENMEMORY) || info == NULL || info->length == 0) {
		return FMOD_ERR_UNSUPPORTED;
	}
	FMOD_SOUND* value = new FMOD_SOUND();
	value->id = ++nextAudioId;
	value->mode = mode;
	command(0, value->id, 0, 0, 0, data, info->length);
	*sound = reinterpret_cast<Sound*>(value);
	return FMOD_OK;
}

FMOD_RESULT System::playSound(FMOD_CHANNELINDEX, Sound* sound, bool paused, Channel** channel)
{
	FMOD_SYSTEM* system = reinterpret_cast<FMOD_SYSTEM*>(this);
	int active = 0;
	for (size_t i = 0; i < system->channels.size(); ++i) {
		if (system->channels[i]->playing) {
			++active;
		}
	}
	if (active >= system->maxChannels) {
		return FMOD_ERR_CHANNEL_ALLOC;
	}
	FMOD_CHANNEL* value = NULL;
	for (size_t i = 0; i < system->channels.size(); ++i) {
		if (!system->channels[i]->playing) {
			value = system->channels[i];
			*value = FMOD_CHANNEL();
			break;
		}
	}
	if (value == NULL) {
		value = new FMOD_CHANNEL();
		system->channels.push_back(value);
	}
	value->id = ++nextAudioId;
	value->sound = reinterpret_cast<FMOD_SOUND*>(sound);
	value->mode = value->sound->mode;
	value->volume = 1;
	value->paused = paused;
	value->playing = true;
	value->started = false;
	*channel = reinterpret_cast<Channel*>(value);
	if (!paused) {
		(*channel)->setPaused(false);
	}
	return FMOD_OK;
}

FMOD_RESULT System::update()
{
	std::vector<int> ended;
	{
		std::lock_guard<std::mutex> lock(endedMutex);
		ended.swap(endedChannels);
	}
	FMOD_SYSTEM* system = reinterpret_cast<FMOD_SYSTEM*>(this);
	for (size_t i = 0; i < system->channels.size(); ++i) {
		FMOD_CHANNEL* channel = system->channels[i];
		if (channel->playing && std::find(ended.begin(), ended.end(), channel->id) != ended.end()) {
			channel->playing = false;
			if (channel->callback != NULL) {
				channel->callback(channel, FMOD_CHANNEL_CALLBACKTYPE_END, channel->callbackCommand, 0, 0);
			}
		}
	}
	return FMOD_OK;
}

FMOD_RESULT System::release()
{
	FMOD_SYSTEM* system = reinterpret_cast<FMOD_SYSTEM*>(this);
	for (size_t i = 0; i < system->channels.size(); ++i) {
		command(3, system->channels[i]->id);
		delete system->channels[i];
	}
	delete system;
	return FMOD_OK;
}

FMOD_RESULT Sound::release()
{
	FMOD_SOUND* sound = reinterpret_cast<FMOD_SOUND*>(this);
	command(8, sound->id);
	delete sound;
	return FMOD_OK;
}

FMOD_RESULT Channel::getPaused(bool* paused)
{
	*paused = reinterpret_cast<FMOD_CHANNEL*>(this)->paused;
	return FMOD_OK;
}

FMOD_RESULT Channel::isPlaying(bool* playing)
{
	*playing = reinterpret_cast<FMOD_CHANNEL*>(this)->playing;
	return FMOD_OK;
}

FMOD_RESULT Channel::getMode(FMOD_MODE* mode)
{
	*mode = reinterpret_cast<FMOD_CHANNEL*>(this)->mode;
	return FMOD_OK;
}

FMOD_RESULT Channel::setMode(FMOD_MODE mode)
{
	FMOD_CHANNEL* channel = reinterpret_cast<FMOD_CHANNEL*>(this);
	channel->mode = mode;
	command(5, channel->id, (mode & FMOD_LOOP_NORMAL) != 0);
	return FMOD_OK;
}

FMOD_RESULT Channel::setLoopCount(int count)
{
	return count == 0 || count == -1 ? FMOD_OK : FMOD_ERR_UNSUPPORTED;
}

FMOD_RESULT Channel::setVolume(float volume)
{
	FMOD_CHANNEL* channel = reinterpret_cast<FMOD_CHANNEL*>(this);
	channel->volume = volume;
	command(4, channel->id, volume);
	return FMOD_OK;
}

FMOD_RESULT Channel::setUserData(void* user)
{
	reinterpret_cast<FMOD_CHANNEL*>(this)->user = user;
	return FMOD_OK;
}

FMOD_RESULT Channel::setCallback(FMOD_CHANNEL_CALLBACKTYPE type, FMOD_CHANNEL_CALLBACK callback, int callbackCommand)
{
	if (type != FMOD_CHANNEL_CALLBACKTYPE_END) {
		return FMOD_ERR_UNSUPPORTED;
	}
	FMOD_CHANNEL* channel = reinterpret_cast<FMOD_CHANNEL*>(this);
	channel->callback = callback;
	channel->callbackCommand = callbackCommand;
	return FMOD_OK;
}

FMOD_RESULT Channel::setPaused(bool paused)
{
	FMOD_CHANNEL* channel = reinterpret_cast<FMOD_CHANNEL*>(this);
	if (!channel->playing) {
		return FMOD_ERR_INVALID_HANDLE;
	}
	channel->paused = paused;
	if (!paused && !channel->started) {
		command(1, channel->id, channel->sound->id, channel->volume, (channel->mode & FMOD_LOOP_NORMAL) != 0);
		channel->started = true;
	}
	else {
		command(paused ? 2 : 9, channel->id);
	}
	return FMOD_OK;
}

FMOD_RESULT Channel::set3DAttributes(const FMOD_VECTOR* position, const FMOD_VECTOR*)
{
	if (position != NULL) {
		FMOD_CHANNEL* channel = reinterpret_cast<FMOD_CHANNEL*>(this);
		command(6, channel->id, position->x, position->y, position->z);
	}
	return FMOD_OK;
}

FMOD_RESULT Channel::stop()
{
	FMOD_CHANNEL* channel = reinterpret_cast<FMOD_CHANNEL*>(this);
	channel->playing = false;
	command(3, channel->id);
	return FMOD_OK;
}

} // namespace FMOD
