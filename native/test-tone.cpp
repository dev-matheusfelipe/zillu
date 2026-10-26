#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <mmsystem.h>
#include <cmath>
#include <vector>
#include <iostream>
int main(int argc,char** argv){double frequency=argc>1?atof(argv[1]):440;const int frames=48000*6;std::vector<short> audio(frames*2);for(int i=0;i<frames;i++){short value=(short)(655*sin(2*3.141592653589793*frequency*i/48000));audio[i*2]=audio[i*2+1]=value;}WAVEFORMATEX format{};format.wFormatTag=WAVE_FORMAT_PCM;format.nChannels=2;format.nSamplesPerSec=48000;format.nAvgBytesPerSec=192000;format.nBlockAlign=4;format.wBitsPerSample=16;HWAVEOUT device=nullptr;if(waveOutOpen(&device,WAVE_MAPPER,&format,0,0,CALLBACK_NULL))return 1;WAVEHDR header{};header.lpData=(LPSTR)audio.data();header.dwBufferLength=(DWORD)(audio.size()*2);waveOutPrepareHeader(device,&header,sizeof(header));waveOutWrite(device,&header,sizeof(header));std::cout<<"READY"<<std::endl;while(!(header.dwFlags&WHDR_DONE))Sleep(10);waveOutUnprepareHeader(device,&header,sizeof(header));waveOutClose(device);return 0;}
