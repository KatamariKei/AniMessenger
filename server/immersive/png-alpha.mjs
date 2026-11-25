import { inflateSync } from 'node:zlib';
export function inspectPng(buffer) {
  if (buffer.length < 33 || buffer.subarray(0,8).toString('hex') !== '89504e470d0a1a0a') throw new Error('Image output is not a PNG.');
  const width=buffer.readUInt32BE(16),height=buffer.readUInt32BE(20),depth=buffer[24],color=buffer[25];
  if (!width || !height || width*height>20_000_000) throw new Error('Unexpected image dimensions.');
  if(color!==6)return {width,height,rgba:false};
  if(depth!==8 || buffer[28]!==0)throw new Error('Unsupported RGBA PNG encoding.');
  const chunks=[];let offset=8;
  while(offset+12<=buffer.length){const size=buffer.readUInt32BE(offset),type=buffer.toString('ascii',offset+4,offset+8);if(offset+12+size>buffer.length)throw new Error('Incomplete PNG.');if(type==='IDAT')chunks.push(buffer.subarray(offset+8,offset+8+size));offset+=12+size;}
  const stride=width*4,raw=inflateSync(Buffer.concat(chunks),{maxOutputLength:(stride+1)*height});
  if(raw.length!==(stride+1)*height)throw new Error('Unexpected PNG data length.');
  let previous=Buffer.alloc(stride),transparent=0,opaque=0;
  for(let y=0;y<height;y++){
    const filter=raw[y*(stride+1)],row=Buffer.from(raw.subarray(y*(stride+1)+1,(y+1)*(stride+1)));
    for(let x=0;x<stride;x++){
      const a=x>=4?row[x-4]:0,b=previous[x],c=x>=4?previous[x-4]:0;let predictor=0;
      if(filter===1)predictor=a;else if(filter===2)predictor=b;else if(filter===3)predictor=Math.floor((a+b)/2);else if(filter===4){const p=a+b-c,pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-c);predictor=pa<=pb&&pa<=pc?a:pb<=pc?b:c;}else if(filter!==0)throw new Error('Invalid PNG filter.');
      row[x]=(row[x]+predictor)&255;
      if(x%4===3){if(row[x]<16)transparent++;if(row[x]>=240)opaque++;}
    }
    previous=row;
  }
  return {width,height,rgba:true,transparent:transparent/(width*height),opaque:opaque/(width*height)};
}
