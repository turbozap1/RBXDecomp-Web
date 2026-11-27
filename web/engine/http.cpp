#include "util/Http.h"

#include <algorithm>
#include <cctype>
#include <cstring>
#include <emscripten/fetch.h>
#include <iterator>
#include <stdexcept>
#include <vector>

namespace {

std::string request(const std::string& url, const char* method, const std::string& body, const std::string& headers)
{
	emscripten_fetch_attr_t attributes;
	emscripten_fetch_attr_init(&attributes);
	std::strcpy(attributes.requestMethod, method);
	attributes.attributes = EMSCRIPTEN_FETCH_LOAD_TO_MEMORY | EMSCRIPTEN_FETCH_SYNCHRONOUS;
	attributes.requestData = body.data();
	attributes.requestDataSize = body.size();
	std::vector<std::string> values;
	size_t start = 0;
	while (start < headers.size()) {
		size_t end = headers.find('\n', start);
		std::string header = headers.substr(start, end == std::string::npos ? end : end - start);
		size_t colon = header.find(':');
		if (colon != std::string::npos) {
			values.push_back(header.substr(0, colon));
			std::string value = header.substr(colon + 1);
			while (!value.empty() && (value[0] == ' ' || value[0] == '\t')) {
				value.erase(0, 1);
			}
			if (!value.empty() && value[value.size() - 1] == '\r') {
				value.erase(value.size() - 1);
			}
			values.push_back(value);
		}
		if (end == std::string::npos) {
			break;
		}
		start = end + 1;
	}
	std::vector<const char*> entries;
	for (size_t i = 0; i < values.size(); ++i) {
		entries.push_back(values[i].c_str());
	}
	entries.push_back(NULL);
	attributes.requestHeaders = &entries[0];
	emscripten_fetch_t* fetch = emscripten_fetch(&attributes, url.c_str());
	if (fetch == NULL) {
		throw std::runtime_error("Browser HTTP request failed: " + url);
	}
	int status = fetch->status;
	std::string response;
	if (fetch->numBytes > 0) {
		response.assign(fetch->data, fetch->numBytes);
	}
	emscripten_fetch_close(fetch);
	if (status < 200 || status >= 300) {
		throw std::runtime_error("Browser HTTP request rejected: " + url);
	}
	return response;
}

} // namespace

namespace RBX {

void Http::get(std::string& response)
{
	response = request(url, "GET", "", additionalHeaders);
}

void Http::post(std::istream& input, bool compress, std::string& response)
{
	if (compress) {
		throw std::runtime_error("Compressed Roblox uploads are not implemented in the browser backend");
	}
	std::string body((std::istreambuf_iterator<char>(input)), std::istreambuf_iterator<char>());
	response = request(url, "POST", body, additionalHeaders);
}

bool Http::isScript(const char* url)
{
	return std::strncmp(url, "javascript:", 11) == 0 || std::strncmp(url, "jscript:", 8) == 0;
}

bool Http::isRobloxSite(const char* url)
{
	std::string address(url);
	size_t scheme = address.find("://");
	if (scheme == std::string::npos) {
		return false;
	}
	size_t end = address.find_first_of("/:?#", scheme + 3);
	std::string host = address.substr(scheme + 3, end == std::string::npos ? end : end - scheme - 3);
	std::transform(host.begin(), host.end(), host.begin(), ::tolower);
	return host == "roblox.com" || (host.size() > 11 && host.substr(host.size() - 11) == ".roblox.com");
}

bool Http::trustCheck(const char* url)
{
	return isRobloxSite(url) || std::strcmp(url, "about:blank") == 0;
}

bool Http::isCached(const char*)
{
	return false;
}

} // namespace RBX
