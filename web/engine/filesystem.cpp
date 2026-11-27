#include "util/FileSystem.h"

#include <algorithm>
#include <cerrno>
#include <stdexcept>
#include <sys/stat.h>

namespace RBX {

std::string FileSystem::getUserAppDataDirectory(bool create, const char* subDirectory)
{
	std::string path = "/user/";
	if (create && mkdir("/user", 0777) != 0 && errno != EEXIST) {
		throw std::runtime_error("Cannot create browser user directory");
	}
	if (subDirectory != NULL) {
		path += subDirectory;
		std::replace(path.begin(), path.end(), '\\', '/');
		if (create && mkdir(path.c_str(), 0777) != 0 && errno != EEXIST) {
			throw std::runtime_error("Cannot create browser data directory");
		}
		if (path[path.size() - 1] != '/') {
			path += '/';
		}
	}
	return path;
}

std::string FileSystem::getCacheDirectory(bool create)
{
	return getUserAppDataDirectory(create, "cache");
}

} // namespace RBX
