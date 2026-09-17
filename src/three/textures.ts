import { CanvasTexture, SRGBColorSpace, RepeatWrapping } from 'three';
import { cardImageSource } from './cardArtwork';

function canvasTexture(width: number, height: number, paint: (ctx: CanvasRenderingContext2D) => void) {
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  const context = canvas.getContext('2d');
  if (context) paint(context);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

export function feltTexture() {
  const texture = canvasTexture(512, 512, ctx => {
    ctx.fillStyle = '#245b46'; ctx.fillRect(0, 0, 512, 512);
    // Deterministic woven flecks, so screenshots and seats never shift randomly.
    for (let i = 0; i < 12000; i++) {
      const x = (i * 71.23) % 512, y = (i * 29.91 + i * i * .007) % 512;
      ctx.fillStyle = i % 2 ? 'rgba(250,240,199,.065)' : 'rgba(0,20,17,.075)';
      ctx.fillRect(x, y, 1.1, .7);
    }
    for(let y=0;y<512;y+=3){ctx.fillStyle='rgba(231,229,168,.025)';ctx.fillRect(0,y,512,.5);}
  });
  texture.wrapS = texture.wrapT = RepeatWrapping;
  texture.repeat.set(5, 3);
  return texture;
}

/** Grayscale material maps are shared across the whole room, then tinted in 3D. */
export function woodGrainTexture() {
  const texture=canvasTexture(1024,512,ctx=>{
    ctx.fillStyle='#c9c4b8';ctx.fillRect(0,0,1024,512);
    for(let y=0;y<512;y+=2){
      const n=Math.sin(y*1.731)*.5+.5;
      ctx.strokeStyle=`rgba(${n>.6?'255,252,228':'61,44,27'},${.06+n*.13})`;
      ctx.lineWidth=.45+n*1.7;ctx.beginPath();
      for(let x=0;x<=1024;x+=12){const yy=y+Math.sin(x*.014+y*.03)*(1+n*5)+Math.sin(x*.035+y*.015)*2;if(x===0)ctx.moveTo(x,yy);else ctx.lineTo(x,yy);}
      ctx.stroke();
    }
    for(const [x,y] of [[231,163],[758,405]]){
      for(let r=3;r<35;r+=3){ctx.strokeStyle=`rgba(46,33,21,${.12-r*.002})`;ctx.lineWidth=1;ctx.beginPath();ctx.ellipse(x,y,r*2.9,r,0,0,Math.PI*2);ctx.stroke();}
    }
  });
  texture.wrapS=texture.wrapT=RepeatWrapping;texture.repeat.set(2,2);
  return texture;
}

export function wovenTexture() {
  const texture=canvasTexture(256,256,ctx=>{
    ctx.fillStyle='#e9e9e0';ctx.fillRect(0,0,256,256);
    for(let i=0;i<256;i+=4){ctx.fillStyle=i%8?'#c6c9bf':'#f3f3e9';ctx.fillRect(i,0,1,256);ctx.fillRect(0,i,256,1);}
    for(let i=0;i<280;i++){ctx.fillStyle='rgba(30,43,32,.08)';ctx.fillRect((i*71.73)%256,(i*53.09)%256,2,1);}
  });texture.wrapS=texture.wrapT=RepeatWrapping;texture.repeat.set(3,3);return texture;
}

export function hairTexture() {
  return canvasTexture(256,256,ctx=>{
    ctx.fillStyle='#c8c7bc';ctx.fillRect(0,0,256,256);
    for(let i=0;i<850;i++){
      const x=(i*31.771)%256,y=(i*57.891)%256;
      ctx.strokeStyle=i%3?'rgba(22,25,17,.22)':'rgba(255,254,229,.27)';ctx.lineWidth=.8;
      ctx.beginPath();ctx.moveTo(x,y);ctx.quadraticCurveTo(x+2,y+3,x+.5,y+7);ctx.stroke();
    }
  });
}

export function labelTexture(lines: string[], color = '#eadab1', background?: string, width = 1024, height = 512) {
  return canvasTexture(width, height, ctx => {
    if (background) { ctx.fillStyle = background; ctx.fillRect(0, 0, width, height); }
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = color;
    lines.forEach((line, index) => {
      ctx.font = `${index === lines.length - 1 && lines.length > 2 ? '500' : '900'} ${lines.length > 2 && index === lines.length - 1 ? height * .075 : height * .235}px Georgia, serif`;
      ctx.fillText(line, width / 2, height * (lines.length === 1 ? .5 : .3 + index * (lines.length > 2 ? .24 : .34)), width * .93);
    });
  });
}

export function tableLogoTexture() {
  return canvasTexture(1024, 600, ctx => {
    ctx.fillStyle = '#b0be94'; ctx.globalAlpha = .62;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = '44px Georgia'; ctx.fillText('♠', 512, 86);
    ctx.font = '900 112px Georgia'; ctx.fillText('BIG MONEY', 512, 200);
    ctx.font = '900 112px Georgia'; ctx.fillText('BIG PLAYERS', 512, 315);
    ctx.font = '500 24px Arial'; ctx.fillText('SMALL STAKES.   MASSIVE EGOS.', 512, 425);
    ctx.strokeStyle = '#b0be94'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(225, 80); ctx.lineTo(445, 80); ctx.moveTo(580, 80); ctx.lineTo(799, 80); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(310, 470); ctx.lineTo(714, 470); ctx.stroke();
  });
}

export function cardTexture(card?: string) {
  const texture = canvasTexture(500,700,ctx=>{ctx.fillStyle='#fffef9';ctx.fillRect(0,0,500,700)});
  texture.anisotropy = 8;
  const image = new Image();
  image.onload = () => { const ctx=(texture.image as HTMLCanvasElement).getContext('2d'); if(ctx){ctx.clearRect(0,0,500,700);ctx.drawImage(image,0,0,500,700);texture.needsUpdate=true;} };
  image.src=cardImageSource(card);
  return texture;
}

export function chipTopTexture(color: string) {
  return canvasTexture(256,256,ctx => {
    ctx.fillStyle=color; ctx.fillRect(0,0,256,256);
    ctx.strokeStyle='#eddfbd'; ctx.lineWidth=17;
    for(let i=0;i<8;i++){ctx.beginPath();ctx.arc(128,128,119,i*Math.PI/4-.13,i*Math.PI/4+.13);ctx.stroke();}
    ctx.fillStyle='#e5d8b6';ctx.beginPath();ctx.arc(128,128,86,0,Math.PI*2);ctx.fill();
    ctx.strokeStyle=color;ctx.lineWidth=3;ctx.beginPath();ctx.arc(128,128,78,0,Math.PI*2);ctx.stroke();
    ctx.fillStyle=color;ctx.textAlign='center';ctx.font='900 21px Georgia';ctx.fillText('BIG MONEY',128,99);ctx.fillText('BIG PLAYERS',128,160);
    ctx.font='33px Georgia';ctx.fillText('♠',128,136);
  });
}

export function chipSideTexture(color: string, count: number) {
  return canvasTexture(256,256,ctx=>{
    ctx.fillStyle=color;ctx.fillRect(0,0,256,256);
    for(let i=0;i<8;i++){ctx.fillStyle='#e5d8b6';ctx.fillRect(i*32+10,0,9,256);}
    for(let i=0;i<count;i++){ctx.fillStyle='rgba(0,0,0,.4)';ctx.fillRect(0,i*256/count,256,2);ctx.fillStyle='rgba(255,255,255,.2)';ctx.fillRect(0,i*256/count+3,256,1);}
  });
}
