#ifndef RBX_WEB_CONTENT_PATH_H
#define RBX_WEB_CONTENT_PATH_H

#include <algorithm>
#include <dirent.h>
#include <string>
#include <sys/stat.h>

typedef const char* LPCSTR;

class CPath
{
private:
	void resolveCase()
	{
		if (m_strPath.empty() || m_strPath == "/") {
			return;
		}
		std::string resolved = m_strPath.empty() || m_strPath[0] != '/' ? "." : "";
		size_t start = m_strPath[0] == '/' ? 1 : 0;
		while (start < m_strPath.size()) {
			size_t end = m_strPath.find('/', start);
			std::string component = m_strPath.substr(start, end == std::string::npos ? end : end - start);
			DIR* directory = opendir(resolved.empty() ? "/" : resolved.c_str());
			if (directory != NULL) {
				while (dirent* entry = readdir(directory)) {
					if (strcasecmp(entry->d_name, component.c_str()) == 0) {
						component = entry->d_name;
						break;
					}
				}
				closedir(directory);
			}
			resolved += '/' + component;
			if (end == std::string::npos) {
				break;
			}
			start = end + 1;
		}
		if (!m_strPath.empty()) {
			m_strPath = resolved;
		}
	}

public:
	std::string m_strPath;

	CPath() {}
	CPath(const char* value) : m_strPath(value)
	{
		std::replace(m_strPath.begin(), m_strPath.end(), '\\', '/');
		if (!m_strPath.empty()) {
			resolveCase();
		}
	}

	operator const char*() const { return m_strPath.c_str(); }
	void Append(const char* value)
	{
		AddBackslash();
		m_strPath += value;
		std::replace(m_strPath.begin(), m_strPath.end(), '\\', '/');
		if (!m_strPath.empty()) {
			resolveCase();
		}
	}
	void AddBackslash()
	{
		if (!m_strPath.empty() && m_strPath[m_strPath.size() - 1] != '/') {
			m_strPath += '/';
		}
	}
	bool IsRelative() const { return m_strPath.empty() || m_strPath[0] != '/'; }
	bool FileExists() const
	{
		struct stat info;
		return stat(m_strPath.c_str(), &info) == 0;
	}
	bool IsDirectory() const
	{
		struct stat info;
		return stat(m_strPath.c_str(), &info) == 0 && S_ISDIR(info.st_mode);
	}
};

#endif
