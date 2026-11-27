#include "renderlib/Profiler.h"
#include "util/Sound.h"
#include "v8datamodel/ICharacterSubject.h"

#include <stdexcept>

namespace RBX {

void ICharacterSubject::getIgnorePrims(std::vector<const Primitive*>&)
{
	throw std::runtime_error(
		"The base ICharacterSubject::getIgnorePrims implementation is missing from the recovered source"
	);
}

void ICharacterSubject::tellCameraNear(float)
{
	throw std::runtime_error(
		"The base ICharacterSubject::tellCameraNear implementation is missing from the recovered source"
	);
}

namespace Render {

bool SpecData::glLoaded = false;

SpecData::SpecData()
	: shaderModel(0), videoMemory(0), CPUSpeed(0), glVendor(), gfxcard(), cpu("WebAssembly"), ram(0), resolution()
{
}

} // namespace Render

} // namespace RBX
template const RBX::FactoryProduct<RBX::Soundscape::SoundChannel, RBX::Instance, RBX::Soundscape::sSoundChannel>::
	Creator RBX::FactoryProduct<RBX::Soundscape::SoundChannel, RBX::Instance, RBX::Soundscape::sSoundChannel>::creator;
