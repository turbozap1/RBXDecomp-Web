#include <cstdlib>
#include <emscripten.h>
#include <lauxlib.h>
#include <lua.h>
#include <lualib.h>

static lua_State* state;
static size_t allocated;
static double deadline;
static const size_t memoryLimit = 32 * 1024 * 1024;

EM_JS(void, hostLog, (const char* message), { Module['host'].log(UTF8ToString(message)); });
EM_JS(int, hostConnect, (const char* url), { return Module['host'].connect(UTF8ToString(url)); });
EM_JS(int, hostSend, (const char* data, int length), {
	return Module['host'].send(HEAPU8.slice(data, data + length));
});
EM_JS(void, hostDisconnect, (), { Module['host'].disconnect(); });
EM_JS(int, hostPlay, (const char* url, double volume, int loop), {
	return Module['host'].play(UTF8ToString(url), volume, !!loop);
});
EM_JS(void, hostStop, (int id), { Module['host'].stop(id); });

static void* allocate(void*, void* pointer, size_t oldSize, size_t newSize)
{
	if (pointer == NULL) {
		oldSize = 0;
	}
	if (newSize == 0) {
		allocated -= oldSize;
		std::free(pointer);
		return NULL;
	}
	if (newSize > memoryLimit - (allocated - oldSize)) {
		return NULL;
	}
	void* result = std::realloc(pointer, newSize);
	if (result != NULL) {
		allocated = allocated - oldSize + newSize;
	}
	return result;
}

static void budget(lua_State* L, lua_Debug*)
{
	if (emscripten_get_now() > deadline) {
		luaL_error(L, "Script exceeded the 100 ms execution budget");
	}
}

static int print(lua_State* L)
{
	lua_getglobal(L, "tostring");
	luaL_Buffer buffer;
	luaL_buffinit(L, &buffer);
	int count = lua_gettop(L) - 1;
	for (int i = 1; i <= count; ++i) {
		lua_pushvalue(L, count + 1);
		lua_pushvalue(L, i);
		lua_call(L, 1, 1);
		size_t length;
		const char* value = lua_tolstring(L, -1, &length);
		if (value == NULL) {
			return luaL_error(L, "tostring must return a string");
		}
		if (i > 1) {
			luaL_addchar(&buffer, '\t');
		}
		luaL_addvalue(&buffer);
	}
	luaL_pushresult(&buffer);
	hostLog(lua_tostring(L, -1));
	return 0;
}

static int connect(lua_State* L)
{
	if (!hostConnect(luaL_checkstring(L, 1))) {
		return luaL_error(L, "Cannot open WebSocket; use a ws:// or wss:// URL");
	}
	return 0;
}

static int send(lua_State* L)
{
	size_t length;
	const char* data = luaL_checklstring(L, 1, &length);
	if (length > 65507 || !hostSend(data, static_cast<int>(length))) {
		return luaL_error(L, "Send failed: socket not open, message too large, or queue full");
	}
	return 0;
}

static int disconnect(lua_State*)
{
	hostDisconnect();
	return 0;
}

static int play(lua_State* L)
{
	const char* url = luaL_checkstring(L, 1);
	double volume = luaL_optnumber(L, 2, 1.0);
	luaL_argcheck(L, volume >= 0 && volume <= 1, 2, "volume must be between 0 and 1");
	int id = hostPlay(url, volume, lua_toboolean(L, 3));
	lua_pushinteger(L, id);
	return 1;
}

static int stop(lua_State* L)
{
	hostStop(luaL_checkint(L, 1));
	return 0;
}

static int loadText(lua_State* L)
{
	size_t length;
	const char* source = luaL_checklstring(L, 1, &length);
	if (length > 0 && source[0] == '\033') {
		return luaL_error(L, "Only Lua source text is supported");
	}
	if (luaL_loadbuffer(L, source, length, "script") == 0) {
		return 1;
	}
	lua_pushnil(L);
	lua_insert(L, -2);
	return 2;
}

static int initialize(lua_State* L)
{
	lua_CFunction libraries[] = {luaopen_base, luaopen_table, luaopen_string, luaopen_math};
	const char* names[] = {"", LUA_TABLIBNAME, LUA_STRLIBNAME, LUA_MATHLIBNAME};
	for (int i = 0; i < 4; ++i) {
		lua_pushcfunction(L, libraries[i]);
		lua_pushstring(L, names[i]);
		lua_call(L, 1, 0);
	}
	const char* removed[] = {"dofile", "loadfile", "load", "newproxy"};
	for (int i = 0; i < 4; ++i) {
		lua_pushnil(L);
		lua_setglobal(L, removed[i]);
	}
	lua_pushcfunction(L, print);
	lua_setglobal(L, "print");
	lua_pushcfunction(L, loadText);
	lua_setglobal(L, "loadstring");
	const luaL_Reg functions[] = {
		{"connect", connect}, {"send", send}, {"disconnect", disconnect}, {"play", play}, {"stop", stop}, {NULL, NULL}
	};
	luaL_register(L, "browser", functions);
	return 0;
}

static int result(int status)
{
	if (status != 0) {
		const char* message = lua_tostring(state, -1);
		hostLog(message != NULL ? message : "Lua raised a non-string error");
	}
	lua_settop(state, 0);
	return status;
}

struct Event
{
	const char* name;
	const char* data;
	int length;
};

static int dispatch(lua_State* L)
{
	Event* event = static_cast<Event*>(lua_touserdata(L, 1));
	lua_getglobal(L, "browser");
	if (!lua_istable(L, -1)) {
		return 0;
	}
	lua_getfield(L, -1, event->name);
	if (lua_isfunction(L, -1)) {
		lua_pushlstring(L, event->data, event->length);
		lua_call(L, 1, 0);
	}
	return 0;
}

extern "C"
{

	EMSCRIPTEN_KEEPALIVE void rbx_destroy()
	{
		if (state != NULL) {
			lua_close(state);
			state = NULL;
		}
	}

	EMSCRIPTEN_KEEPALIVE int rbx_init()
	{
		rbx_destroy();
		state = lua_newstate(allocate, NULL);
		if (state == NULL) {
			return LUA_ERRMEM;
		}
		lua_pushcfunction(state, initialize);
		int status = result(lua_pcall(state, 0, 0, 0));
		if (status != 0) {
			rbx_destroy();
		}
		return status;
	}

	EMSCRIPTEN_KEEPALIVE int rbx_execute(const char* source, int length)
	{
		if (state == NULL || length < 0 || (length > 0 && source[0] == '\033')) {
			return LUA_ERRSYNTAX;
		}
		deadline = emscripten_get_now() + 100.0;
		lua_sethook(state, budget, LUA_MASKCOUNT, 1000);
		int status = luaL_loadbuffer(state, source, length, "browser");
		if (status == 0) {
			status = lua_pcall(state, 0, 0, 0);
		}
		return result(status);
	}

	EMSCRIPTEN_KEEPALIVE int rbx_event(const char* event, const char* data, int length)
	{
		if (state == NULL || length < 0) {
			return LUA_ERRRUN;
		}
		deadline = emscripten_get_now() + 100.0;
		Event payload = {event, data, length};
		return result(lua_cpcall(state, dispatch, &payload));
	}
}
