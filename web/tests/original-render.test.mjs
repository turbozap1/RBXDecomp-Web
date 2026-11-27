import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';

const createEngine=(await import(pathToFileURL(process.argv[2]).href)).default;
const logs=[];
const engine=await createEngine({host:{log:message=>logs.push(message),audio:()=>{}},print:console.log,printErr:console.error});
const execute=source=>assert.equal(engine.ccall('rbx_engine_execute','number',['string'],[source]),0,logs.join('\n'));
function frame(width=480,height=300) {
  assert.equal(engine._rbx_engine_render(width,height),0,logs.join('\n'));
  const pointer=engine._rbx_engine_render_pixels();
  assert.ok(pointer);
  return engine.HEAPU8.slice(pointer,pointer+width*height*4);
}
try {
  assert.equal(engine._rbx_engine_init(),0);
  assert.equal(engine._rbx_engine_render_init(480,300),0,logs.join('\n'));
  execute(`base=Instance.new('Part');base.Anchored=true;base.Size=Vector3.new(32,1,32);base.BrickColor=BrickColor.new(37);base.Parent=workspace
part=Instance.new('Part');part.Anchored=true;part.Position=Vector3.new(0,5,0);part.Size=Vector3.new(4,4,4);part.BrickColor=BrickColor.new(21);part.Parent=workspace`);
  engine._rbx_engine_camera(22,16,22,0,3,0);
  const first=frame();
  assert.ok(engine._rbx_engine_render_triangles()>24,'Original mesh and render scene must submit geometry');
  assert.ok(new Set(new Uint32Array(first.buffer)).size>1000,'Original sky, textures and lighting must produce a nontrivial framebuffer');
  let ink=0;
  for(let y=1;y<18;y++)for(let x=0;x<400;x++){const i=(y*480+x)*4;if(first[i]<30&&first[i+1]<30&&first[i+2]<30)ink++;}
  assert.ok(ink>30,'Original toolbar font must render');
  execute(`part.BrickColor=BrickColor.new(23)`);
  const recolored=frame();
  assert.ok(first.some((value,index)=>value!==recolored[index]),'Original property listeners must update rendered materials');
  const beforeHead=engine._rbx_engine_render_triangles();
  execute(`mesh=Instance.new('SpecialMesh');mesh.MeshType='Head';mesh.Parent=part`);
  frame();
  assert.notEqual(engine._rbx_engine_render_triangles(),beforeHead,'Original HeadMesh must replace the block mesh');
  execute(`part:Remove()`);
  frame();
  assert.ok(engine._rbx_engine_render_triangles()<beforeHead,'Removing an original render Part must update the scene');
  const small=frame(320,200);
  assert.equal(small.length,320*200*4);
  assert.ok(logs.some(message=>message.includes('Original RbxView, RenderLib and GLG3D initialized')));
  assert.ok(!logs.some(message=>message.includes('Failed to load sky')));
  engine._rbx_engine_destroy();
  console.log('Original renderer passed: RbxView/RenderLib/GLG3D/Mesa, sky, textured geometry, fonts, material updates, HeadMesh, removal and resize.');
  process.exit(0);
} catch(error) { console.error(error,logs.join('\n'));process.exit(1); }
