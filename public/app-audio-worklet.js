// The processor only produces a MediaStream destination, never local speaker playback.
class ApplicationAudioProcessor extends AudioWorkletProcessor{
 constructor(){super();this.left=new Float32Array(48000);this.right=new Float32Array(48000);this.read=0;this.write=0;this.count=0;this.port.onmessage=event=>{const samples=event.data;if(!(samples instanceof Float32Array))return;for(let i=0;i+1<samples.length;i+=2){if(this.count===48000){this.read=(this.read+1)%48000;this.count--;}this.left[this.write]=samples[i];this.right[this.write]=samples[i+1];this.write=(this.write+1)%48000;this.count++;}};}
 process(_inputs,outputs){const output=outputs[0];if(!output?.length)return true;for(let i=0;i<output[0].length;i++){const ready=this.count>0;output[0][i]=ready?this.left[this.read]:0;if(output[1])output[1][i]=ready?this.right[this.read]:0;if(ready){this.read=(this.read+1)%48000;this.count--;}}return true;}
}
registerProcessor('zillu-application-audio',ApplicationAudioProcessor);
