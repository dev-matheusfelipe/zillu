// Zillu application-only audio bridge. WASAPI process loopback, no microphone access.
#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <audioclient.h>
#include <mmdeviceapi.h>
#include <tlhelp32.h>
#include <fcntl.h>
#include <io.h>
#include <atomic>
#include <algorithm>
#include <iostream>
#include <map>
#include <set>
#include <string>
#include <vector>
#include <cmath>
#include <cstdio>
#include <cwctype>

static std::wstring lower(std::wstring s){std::transform(s.begin(),s.end(),s.begin(),::towlower);return s;}
static std::string utf8(const std::wstring& s){if(s.empty())return "";int n=WideCharToMultiByte(CP_UTF8,0,s.data(),(int)s.size(),nullptr,0,nullptr,nullptr);std::string out(n,0);WideCharToMultiByte(CP_UTF8,0,s.data(),(int)s.size(),out.data(),n,nullptr,nullptr);return out;}
static std::string json(const std::wstring& value){std::string out="\"";for(unsigned char c:utf8(value)){if(c=='"'||c=='\\'){out+='\\';out+=c;}else if(c>=32)out+=c;}return out+'"';}
struct Process{DWORD parent;std::wstring exe;};
static std::map<DWORD,Process> processes(){std::map<DWORD,Process> result;HANDLE snapshot=CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS,0);if(snapshot==INVALID_HANDLE_VALUE)return result;PROCESSENTRY32W entry{};entry.dwSize=sizeof(entry);if(Process32FirstW(snapshot,&entry))do{result[entry.th32ProcessID]={entry.th32ParentProcessID,lower(entry.szExeFile)};}while(Process32NextW(snapshot,&entry));CloseHandle(snapshot);return result;}
static bool blocked(const std::wstring& exe){static const std::set<std::wstring> names={L"discord.exe",L"discordcanary.exe",L"discordptb.exe",L"discorddevelopment.exe",L"teamspeak.exe",L"teamspeak3.exe",L"teamspeak6.exe",L"ts3client_win64.exe",L"ts3client_win32.exe",L"ts6.exe",L"ms-teams.exe",L"msteams.exe",L"zillu.exe",L"electron.exe"};return names.count(lower(exe))>0;}
static DWORD rootProcess(DWORD pid,const std::map<DWORD,Process>& all){std::set<DWORD> visited;while(all.count(pid)&&visited.insert(pid).second){const auto& p=all.at(pid);if(!all.count(p.parent)||all.at(p.parent).exe!=p.exe)break;pid=p.parent;}return pid;}
struct ListContext{std::map<DWORD,Process> all;std::set<DWORD> seen;bool first=true;};
static BOOL CALLBACK listWindow(HWND window,LPARAM param){auto& ctx=*(ListContext*)param;if(!IsWindowVisible(window)||GetWindowTextLengthW(window)<1)return TRUE;DWORD pid=0;GetWindowThreadProcessId(window,&pid);pid=rootProcess(pid,ctx.all);if(!ctx.all.count(pid)||blocked(ctx.all[pid].exe)||!ctx.seen.insert(pid).second)return TRUE;wchar_t title[512]{};GetWindowTextW(window,title,512);if(!ctx.first)std::cout<<',';ctx.first=false;std::cout<<"{\"pid\":"<<pid<<",\"name\":"<<json(title)<<",\"process\":"<<json(ctx.all[pid].exe)<<"}";return TRUE;}
static bool supported(){typedef LONG(WINAPI *VersionFn)(OSVERSIONINFOW*);OSVERSIONINFOW version{};version.dwOSVersionInfoSize=sizeof(version);auto fn=(VersionFn)GetProcAddress(GetModuleHandleW(L"ntdll.dll"),"RtlGetVersion");return fn&&fn(&version)==0&&version.dwBuildNumber>=20348;}
// Structures from the documented AUDIOCLIENT_ACTIVATION_PARAMS ABI (Windows build 20348+).
struct ProcessLoopbackParams{DWORD pid;DWORD mode;};
struct ActivationParams{DWORD type;ProcessLoopbackParams process;};
class Completion:public IActivateAudioInterfaceCompletionHandler{
 std::atomic<ULONG> refs{1};
 public:HANDLE ready=CreateEventW(nullptr,TRUE,FALSE,nullptr);HRESULT result=E_FAIL;IAudioClient* client=nullptr;
 ~Completion(){if(client)client->Release();CloseHandle(ready);}
 HRESULT STDMETHODCALLTYPE QueryInterface(REFIID iid,void** ptr)override{static const GUID agile={0x94ea2b94,0xe9cc,0x49e0,{0xc0,0xff,0xee,0x64,0xca,0x8f,0x5b,0x90}};if(iid==__uuidof(IUnknown)||iid==__uuidof(IActivateAudioInterfaceCompletionHandler)||iid==agile){*ptr=static_cast<IActivateAudioInterfaceCompletionHandler*>(this);AddRef();return S_OK;}*ptr=nullptr;return E_NOINTERFACE;}
 ULONG STDMETHODCALLTYPE AddRef()override{return ++refs;}ULONG STDMETHODCALLTYPE Release()override{ULONG value=--refs;if(!value)delete this;return value;}
 HRESULT STDMETHODCALLTYPE ActivateCompleted(IActivateAudioInterfaceAsyncOperation* operation)override{IUnknown* object=nullptr;HRESULT activation=E_FAIL;result=operation->GetActivateResult(&activation,&object);if(SUCCEEDED(result))result=activation;if(SUCCEEDED(result)&&object)result=object->QueryInterface(__uuidof(IAudioClient),(void**)&client);if(object)object->Release();SetEvent(ready);return S_OK;}
};
static int capture(DWORD pid){
 auto all=processes();if(!all.count(pid)||blocked(all[pid].exe)){std::cerr<<"ERROR: aplicativo de chamada ou processo indisponivel\n";return 2;}
 if(!supported()){std::cerr<<"ERROR: Windows sem suporte a audio por processo\n";return 3;}
 HRESULT hr=CoInitializeEx(nullptr,COINIT_MULTITHREADED);if(FAILED(hr))return 4;
 HMODULE library=LoadLibraryW(L"Mmdevapi.dll");using ActivateFn=HRESULT(WINAPI*)(LPCWSTR,REFIID,PROPVARIANT*,IActivateAudioInterfaceCompletionHandler*,IActivateAudioInterfaceAsyncOperation**);
 auto activate=(ActivateFn)GetProcAddress(library,"ActivateAudioInterfaceAsync");if(!activate)return 5;
 ActivationParams params{1,{pid,0}};PROPVARIANT variant{};variant.vt=VT_BLOB;variant.blob.cbSize=sizeof(params);variant.blob.pBlobData=(BYTE*)&params;
 Completion* completion=new Completion();IActivateAudioInterfaceAsyncOperation* operation=nullptr;
 hr=activate(L"VAD\\Process_Loopback",__uuidof(IAudioClient),&variant,completion,&operation);
 if(SUCCEEDED(hr)&&WaitForSingleObject(completion->ready,10000)==WAIT_OBJECT_0)hr=completion->result;else if(SUCCEEDED(hr))hr=E_FAIL;
 if(FAILED(hr)||!completion->client){std::cerr<<"ERROR: ativacao WASAPI 0x"<<std::hex<<(unsigned long)hr<<"\n";if(operation)operation->Release();completion->Release();return 6;}
 IAudioClient* client=completion->client;client->AddRef();operation->Release();completion->Release();
 WAVEFORMATEX format{};format.wFormatTag=WAVE_FORMAT_IEEE_FLOAT;format.nChannels=2;format.nSamplesPerSec=48000;format.wBitsPerSample=32;format.nBlockAlign=8;format.nAvgBytesPerSec=384000;
 hr=client->Initialize(AUDCLNT_SHAREMODE_SHARED,AUDCLNT_STREAMFLAGS_LOOPBACK,200000,0,&format,nullptr);
 IAudioCaptureClient* reader=nullptr;if(SUCCEEDED(hr))hr=client->GetService(__uuidof(IAudioCaptureClient),(void**)&reader);if(SUCCEEDED(hr))hr=client->Start();
 if(FAILED(hr)){std::cerr<<"ERROR: inicializacao WASAPI 0x"<<std::hex<<(unsigned long)hr<<"\n";if(reader)reader->Release();client->Release();return 7;}
 _setmode(_fileno(stdout),_O_BINARY);std::cerr<<"READY\n"<<std::flush;
 HANDLE target=OpenProcess(SYNCHRONIZE,FALSE,pid);
 HANDLE input=GetStdHandle(STD_INPUT_HANDLE);bool running=true;std::vector<float> silence;
 while(running){
  if(target&&WaitForSingleObject(target,0)==WAIT_OBJECT_0)break;
  DWORD available=0;if(!PeekNamedPipe(input,nullptr,0,nullptr,&available,nullptr)&&GetLastError()==ERROR_BROKEN_PIPE)break;
  UINT32 packet=0;hr=reader->GetNextPacketSize(&packet);if(FAILED(hr))break;
  while(packet){BYTE* data=nullptr;UINT32 frames=0;DWORD flags=0;hr=reader->GetBuffer(&data,&frames,&flags,nullptr,nullptr);if(FAILED(hr)){running=false;break;}
   size_t samples=(size_t)frames*2;if(flags&AUDCLNT_BUFFERFLAGS_SILENT){silence.assign(samples,0);data=(BYTE*)silence.data();}
   bool written=fwrite(data,sizeof(float),samples,stdout)==samples;reader->ReleaseBuffer(frames);if(!written){running=false;break;}fflush(stdout);
   hr=reader->GetNextPacketSize(&packet);if(FAILED(hr)){running=false;break;}
  }Sleep(5);
 }
 if(target)CloseHandle(target);
 client->Stop();reader->Release();client->Release();CoUninitialize();return 0;
}
int main(int argc,char** argv){if(argc==2&&std::string(argv[1])=="--probe"){std::cout<<(supported()?"true":"false");return 0;}if(argc==2&&std::string(argv[1])=="--list"){ListContext ctx{processes()};std::cout<<'[';EnumWindows(listWindow,(LPARAM)&ctx);std::cout<<']';return 0;}if(argc==3&&std::string(argv[1])=="--capture"){char* end=nullptr;unsigned long pid=strtoul(argv[2],&end,10);if(!end||*end||!pid)return 1;return capture((DWORD)pid);}return 1;}
