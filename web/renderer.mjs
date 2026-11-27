export class Renderer {
  constructor(canvas, mouse) {
    this.canvas=canvas;
    this.context=canvas.getContext('2d',{alpha:false});
    if(!this.context) throw new Error('Canvas presentation is unavailable');
    let previous;
    const position=event=>{
      const rect=canvas.getBoundingClientRect();
      return [Math.round((event.clientX-rect.left)*canvas.width/rect.width),Math.round((event.clientY-rect.top)*canvas.height/rect.height)];
    };
    const send=(type,event)=>{
      const [x,y]=position(event), dx=previous?x-previous[0]:0, dy=previous?y-previous[1]:0;
      previous=[x,y];mouse({type,x,y,dx,dy});
    };
    canvas.onpointerdown=event=>{if(event.button!==0&&event.button!==2)return;canvas.focus();canvas.setPointerCapture(event.pointerId);send(event.button===2?1:3,event);event.preventDefault();};
    canvas.onpointerup=event=>{if(event.button!==0&&event.button!==2)return;send(event.button===2?2:4,event);};
    canvas.onpointercancel=event=>{send(2,event);send(4,event);previous=null;};
    canvas.onpointermove=event=>send(5,event);
    canvas.onpointerleave=event=>{if(!event.buttons) { previous=null;mouse({type:5,x:-10000,y:-10000,dx:0,dy:0}); }};
    canvas.onwheel=event=>{event.preventDefault();send(event.deltaY<0?8:9,event);};
    canvas.oncontextmenu=event=>event.preventDefault();
  }
  size() {
    return [Math.max(1,Math.min(1280,Math.round(this.canvas.clientWidth))),Math.max(1,Math.min(1024,Math.round(this.canvas.clientHeight)))];
  }
  draw(pixels,width,height) {
    if(this.canvas.width!==width || this.canvas.height!==height) { this.canvas.width=width;this.canvas.height=height; }
    this.context.putImageData(new ImageData(new Uint8ClampedArray(pixels),width,height),0,0);
  }
}
