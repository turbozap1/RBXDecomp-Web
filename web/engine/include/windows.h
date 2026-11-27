#ifndef RBX_WEB_WINDOWS_H
#define RBX_WEB_WINDOWS_H

#include <cstdio>
#include <ctime>
#include <emscripten.h>
#include <pthread.h>
#include <stdexcept>
#include <stdint.h>
#include <unistd.h>

typedef uint32_t DWORD;
typedef int BOOL;
typedef void* HANDLE;
typedef void* LPVOID;
typedef const char* LPCSTR;

struct LARGE_INTEGER
{
	long long QuadPart;
};
struct SYSTEMTIME
{
	unsigned short wYear, wMonth, wDayOfWeek, wDay, wHour, wMinute, wSecond, wMilliseconds;
};

inline void GetLocalTime(SYSTEMTIME* result)
{
	timespec instant;
	clock_gettime(CLOCK_REALTIME, &instant);
	std::tm local;
	localtime_r(&instant.tv_sec, &local);
	result->wYear = local.tm_year + 1900;
	result->wMonth = local.tm_mon + 1;
	result->wDayOfWeek = local.tm_wday;
	result->wDay = local.tm_mday;
	result->wHour = local.tm_hour;
	result->wMinute = local.tm_min;
	result->wSecond = local.tm_sec;
	result->wMilliseconds = instant.tv_nsec / 1000000;
}

inline BOOL QueryPerformanceCounter(LARGE_INTEGER* result)
{
	result->QuadPart = static_cast<long long>(emscripten_get_now() * 1000000.0);
	return 1;
}

inline BOOL QueryPerformanceFrequency(LARGE_INTEGER* result)
{
	result->QuadPart = 1000000000;
	return 1;
}

inline DWORD GetCurrentThreadId()
{
	return static_cast<DWORD>(reinterpret_cast<uintptr_t>(pthread_self()));
}

struct FILETIME
{
	DWORD dwLowDateTime;
	DWORD dwHighDateTime;
};

union ULARGE_INTEGER {
	struct
	{
		DWORD LowPart;
		DWORD HighPart;
	};
	uint64_t QuadPart;
};

inline void* GetCurrentThread()
{
	return reinterpret_cast<void*>(pthread_self());
}

inline BOOL GetThreadTimes(HANDLE, FILETIME* creation, FILETIME* exit, FILETIME* kernel, FILETIME* user)
{
	creation->dwLowDateTime = creation->dwHighDateTime = 0;
	exit->dwLowDateTime = exit->dwHighDateTime = 0;
	kernel->dwLowDateTime = kernel->dwHighDateTime = 0;
	user->dwLowDateTime = user->dwHighDateTime = 0;
	return 0;
}

enum
{
	MB_YESNO = 4,
	IDYES = 6
};

inline int MessageBox(HANDLE, const char*, const char*, unsigned int)
{
	throw std::runtime_error("Interactive editor prompts are unavailable in the browser engine worker");
}

inline DWORD GetTickCount()
{
	return static_cast<DWORD>(emscripten_get_now());
}

inline BOOL DeleteFile(const char* path)
{
	return std::remove(path) == 0;
}

inline long InterlockedIncrement(volatile long* value)
{
	return __atomic_add_fetch(value, 1, __ATOMIC_SEQ_CST);
}

inline long InterlockedDecrement(volatile long* value)
{
	return __atomic_sub_fetch(value, 1, __ATOMIC_SEQ_CST);
}

inline long InterlockedExchangeAdd(volatile long* value, long amount)
{
	return __atomic_fetch_add(value, amount, __ATOMIC_SEQ_CST);
}

inline DWORD TlsAlloc()
{
	pthread_key_t key;
	return pthread_key_create(&key, NULL) == 0 ? key + 1 : 0xffffffff;
}

inline void* TlsGetValue(DWORD key)
{
	return pthread_getspecific(key - 1);
}

inline BOOL TlsSetValue(DWORD key, void* value)
{
	return pthread_setspecific(key - 1, value) == 0;
}

#endif
