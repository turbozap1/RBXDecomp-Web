#ifndef RBX_WEB_ENGINE_COMPAT_H
#define RBX_WEB_ENGINE_COMPAT_H

#include <cmath>
#include <cstdio>
#include <ctime>
#include <iterator>
#include <strings.h>
#include <windows.h>

#undef TIME_UTC

#undef NULL
#define NULL 0

namespace std {
typedef iterator<output_iterator_tag, void, void, void, void> _Outit;
}

inline long long _time64(long long* result)
{
	long long value = std::time(NULL);
	if (result != NULL) {
		*result = value;
	}
	return value;
}

#define _stricmp strcasecmp
#define _strnicmp strncasecmp
#define _snprintf snprintf
#define _vsnprintf vsnprintf

#endif
