#ifndef RBX_BROWSER_INPUT_H
#define RBX_BROWSER_INPUT_H

#include "util/UserInputBase.h"

#include <set>

class BrowserInput : public RBX::UserInputBase
{
	std::set<SDLKey> keys;
	WrapMode mode;
	G3D::Vector2 position;

protected:
	virtual G3D::Vector2 getCursorPosition() { return position; }

public:
	BrowserInput() : mode(WRAP_AUTO), position(-10000, -10000) {}
	virtual void setWrapMode(WrapMode value) { mode = value; }
	virtual WrapMode getWrapMode() const { return mode; }
	virtual void centerCursor() { mode = WRAP_CENTER; }
	virtual bool keyDown(SDLKey key) const { return keys.find(key) != keys.end(); }
	virtual void setKeyState(SDLKey key, bool down)
	{
		if (down) {
			keys.insert(key);
		}
		else {
			keys.erase(key);
		}
	}
	void setPosition(float x, float y) { position = G3D::Vector2(x, y); }
	void reset()
	{
		keys.clear();
		mode = WRAP_AUTO;
	}
};

#endif
