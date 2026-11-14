"""Speech-like test audio: voiced syllables with pitch and pauses (for the voice biomarker tests)."""
import io, wave, numpy as np
def speech(rate=4.5, pause_every=6, pause_s=0.25, pitch=130, pitch_var=3.0, secs=15, sr=16000, seed=0):
    rng=np.random.default_rng(seed); out=[]; t=0; n=0
    syl=1/rate*0.7; gap=1/rate*0.3
    while t<secs:
        L=int(syl*sr); tt=np.arange(L)/sr
        f0=pitch*2**(rng.normal(0,pitch_var)/12)
        ph=2*np.pi*f0*tt; s=sum(np.sin(k*ph)/k for k in range(1,6))
        env=np.sin(np.pi*tt/syl)**2; out.append(0.3*s*env); t+=syl; n+=1
        g=gap+(pause_s if n%pause_every==0 else 0); out.append(rng.normal(0,0.002,int(g*sr))); t+=g
    x=np.concatenate([np.zeros(int(0.5*sr)),np.concatenate(out),np.zeros(int(0.5*sr))])
    b=io.BytesIO(); w=wave.open(b,'wb'); w.setnchannels(1); w.setsampwidth(2); w.setframerate(sr); w.writeframes((np.clip(x,-1,1)*32767).astype(np.int16).tobytes()); w.close()
    return b.getvalue()
