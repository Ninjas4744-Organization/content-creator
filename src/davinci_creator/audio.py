"""Original procedural score and effects; no external music files required."""
from pathlib import Path
import math,json,wave
import numpy as np
SR=48000

def wav_read(path):
 with wave.open(str(path)) as f:
  rate=f.getframerate();ch=f.getnchannels();width=f.getsampwidth();raw=f.readframes(f.getnframes())
 if width!=2:raise ValueError('Expected 16-bit narration')
 a=np.frombuffer(raw,dtype='<i2').astype(np.float32)/32768
 if ch>1:a=a.reshape(-1,ch).mean(axis=1)
 # Remove only the surrounding silence, keeping a breath margin at each edge.
 hop=max(1,int(rate*.01));n=len(a)//hop
 rms=np.sqrt((a[:n*hop].reshape(n,hop)**2).mean(axis=1))
 active=np.flatnonzero(rms>max(.0015,float(rms.max())*.023))
 if active.size:a=a[max(0,int((active[0]*.01-.05)*rate)):min(len(a),int((active[-1]*.01+.20)*rate))]
 if rate!=SR:a=np.interp(np.arange(round(len(a)*SR/rate))*rate/SR,np.arange(len(a)),a).astype(np.float32)
 rms=float(np.sqrt(np.mean(a*a)));peak=float(np.max(np.abs(a)))
 gain=min(3.5,.12/max(rms,1e-4),.84/max(peak,1e-4));a*=gain
 return a

def wav_write(path,a,rate=SR):
 path.parent.mkdir(parents=True,exist_ok=True)
 with wave.open(str(path),'wb') as f:
  f.setnchannels(1 if a.ndim==1 else a.shape[1]);f.setsampwidth(2);f.setframerate(rate)
  f.writeframes((np.clip(a,-.999,.999)*32767).astype('<i2').tobytes())

def caption_groups(text,maxwords=9):
 words=text.split();groups=[];current=[]
 for w in words:
  current.append(w)
  if len(current)>=maxwords or (len(current)>=4 and w.endswith(('.', '?', '!'))):groups.append(' '.join(current));current=[]
 if current:
  if len(current)<3 and groups:groups[-1]+=' '+' '.join(current)
  else:groups.append(' '.join(current))
 return groups

def add(buf,signal,start,amp=1):
 i=round(start*SR);offset=max(0,-i);i=max(0,i);n=min(len(signal)-offset,len(buf)-i)
 if n>0:buf[i:i+n]+=signal[offset:offset+n]*amp

def tone(freq,duration,amp=.02,pan=0,brightness=.18):
 t=np.arange(round(duration*SR),dtype=np.float32)/SR
 env=(1-np.exp(-t*35))*np.exp(-t*3.1/duration)
 a=(np.sin(2*np.pi*freq*t)+brightness*np.sin(2*np.pi*2*freq*t)+brightness*.4*np.sin(2*np.pi*3*freq*t))*env*amp
 return np.stack((a*math.sqrt((1-pan)/2),a*math.sqrt((1+pan)/2)),axis=1)

def score(timeline,voices,out):
 length=math.ceil(timeline['duration']*SR);music=np.zeros((length,2),np.float32);fx=np.zeros_like(music);speech=np.zeros_like(music)
 rng=np.random.default_rng(4744);beat=60/104;bar=beat*4;chords=[[50,54,57,62],[47,50,54,59],[43,47,50,55],[45,49,52,57]]
 midi=lambda n:440*2**((n-69)/12)
 # Original instrumental score: slowly changing pads, bass and gentle arpeggios.
 for b in range(math.ceil(timeline['duration']/bar)):
  chord=chords[(b//2)%4];at=b*bar
  for j,n in enumerate(chord):
   a=tone(midi(n+12),bar*1.75,.013,[-.7,-.25,.3,.72][j],.09)
   attack=np.minimum(1,np.arange(len(a))/int(SR*.45));release=np.minimum(1,np.arange(len(a))[::-1]/int(SR*.65));a*= (attack*release)[:,None]
   add(music,a,at)
  for step in range(8):
   n=chord[(step+b)%4]+24;pan=.65*math.sin(step*1.4+b)
   add(music,tone(midi(n),beat*.90,.009,pan,.13),at+step*beat/2)
  for step in [0,2]:
   add(music,tone(midi(chord[0]-12),beat*1.4,.045,0,.12),at+step*beat)
  for step in range(4):
   tt=np.arange(int(SR*.22),dtype=np.float32)/SR
   kick=np.sin(2*np.pi*(47*tt+3*(1-np.exp(-tt*28))))*np.exp(-tt*22)*.041
   add(music,np.stack((kick,kick),axis=1),at+step*beat)
  for step in range(8):
   n=int(SR*.055);noise=rng.normal(size=n).astype(np.float32);noise=np.diff(noise,prepend=0);hat=noise*np.exp(-np.arange(n)/SR*80)*.0028
   add(music,np.stack((hat*.7,hat),axis=1),at+step*beat/2)
  for step in [1,3]:
   n=int(SR*.13);noise=rng.normal(size=n).astype(np.float32);sn=noise*np.exp(-np.arange(n)/SR*28)*.006
   add(music,np.stack((sn,sn),axis=1),at+step*beat)
 for i,s in enumerate(timeline['scenes']):
  at=s['start'];a=voices[i];stereo=np.stack((a,a),axis=1)
  add(speech,stereo,at+s['voice_offset'])
  # Transition swoosh and focused notification tones follow the animation entrances.
  n=int(SR*.62);t=np.arange(n,dtype=np.float32)/SR;noise=rng.normal(size=n).astype(np.float32)
  smooth=np.convolve(noise,np.ones(13,dtype=np.float32)/13,mode='same');whoosh=(noise-smooth)*np.sin(np.pi*t/.62)**3*.022
  pan=np.linspace(-.7,.7,n);swoosh=np.stack((whoosh*np.sqrt((1-pan)/2),whoosh*np.sqrt((1+pan)/2)),axis=1)
  if i:add(fx,swoosh,at-.17)
  count=min(6,max(2,len(s.get('items',[]))))
  for k in range(count):
   q=tone(midi(81+(k%3)*3),.38,.012,(-.6 if k%2==0 else .6),.2)
   add(fx,q,at+.65+k*.61)
  if i in [0,len(timeline['scenes'])-1]:add(fx,tone(midi(74),1.8,.025,0,.1),at+.9)
 # The instrumental continues throughout, with automatic speech ducking.
 hop=480;env=np.sqrt((speech[:length//hop*hop,0].reshape(-1,hop)**2).mean(axis=1));activity=(env>.008).astype(np.float32)
 activity=np.convolve(activity,np.ones(35)/35,mode='same');duck=np.interp(np.arange(length)/hop,np.arange(len(activity)),activity)
 music*= (1-.72*duck)[:,None];fx*= (1-.3*duck)[:,None]
 fade=np.minimum(1,np.arange(length)/SR/1.1)*np.minimum(1,np.arange(length)[::-1]/SR/2.1);music*=fade[:,None]
 mix=speech+music+fx
 peak=float(np.max(np.abs(mix)));mix*=min(1,.94/max(peak,1e-4))
 wav_write(out/'music-original.wav',music);wav_write(out/'sound-effects.wav',fx);wav_write(out/'narration.wav',speech);wav_write(out/'mix.wav',mix)
 audit={'duration_seconds':timeline['duration'],'sample_rate':SR,'speech_peak':float(np.max(np.abs(speech))),'music_peak':float(np.max(np.abs(music))),'fx_peak':float(np.max(np.abs(fx))),'mix_peak':float(np.max(np.abs(mix))),'clipped_samples':int(np.count_nonzero(np.abs(mix)>=1)),'narration_source':'draft without narration' if timeline.get('draft') else 'Gemini TTS','female_voice':timeline.get('voices',{}).get('female','Kore'),'male_voice':timeline.get('voices',{}).get('male','Puck'),'music_and_effects':'Original procedural composition by the Python source in audio.py'}
 (out/'audio-report.json').write_text(json.dumps(audit,indent=2))
 # External captions use the same scene-local schedule as the burned-in captions.
 def stamp(x):
  ms=round(x*1000);return f'{ms//3600000:02d}:{ms//60000%60:02d}:{ms//1000%60:02d},{ms%1000:03d}'
 entries=[];k=1
 for s in timeline['scenes']:
  for j,txt in enumerate(s['captions']):
   start=s['start']+s['voice_offset']+j*s['voice_duration']/len(s['captions']);end=s['start']+s['voice_offset']+(j+1)*s['voice_duration']/len(s['captions'])
   entries.append(f'{k}\n{stamp(start)} --> {stamp(end)}\n{txt}\n');k+=1
 (out.parent/'captions.srt').write_text('\n'.join(entries))
 print(f'Audio ready: {timeline["duration"]:.1f}s, peak {audit["mix_peak"]:.3f}, clipping {audit["clipped_samples"]}',flush=True)
