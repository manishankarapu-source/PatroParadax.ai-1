import { useState, useRef, useCallback } from 'react';
import { pcmToBase64, base64ToFloat32Array } from './audioUtils';

export interface ChatMessage {
  id: string;
  text: string;
  isServer: boolean;
}

export function useLiveAPI(onMemoryFact?: (fact: string) => void, onMemoryVisual?: (label: string, image: string) => void) {
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [volume, setVolume] = useState(0);
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);
  const [mediaStream, setMediaStream] = useState<MediaStream | null>(null);
  const [cameraEnabled, setCameraEnabled] = useState(false);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  
  const wsRef = useRef<WebSocket | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const frameIntervalRef = useRef<number | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  
  const nextStartTimeRef = useRef<number>(0);

  const start = useCallback(async (voice: string = 'Zephyr', memory: string[] = [], enableCamera: boolean = false, visualMemories: {label: string, image: string}[] = []) => {
    try {
      setError(null);
      setMessages([]);
      setCameraEnabled(enableCamera);
      // Determine protocol: wss for https, ws for http
      let protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      let host = window.location.host;
      
      // If deployed on Vercel, route WebSocket traffic to the Google AI Studio published backend
      if (host.includes('vercel.app')) {
        host = 'ais-pre-ckx5i4qxvstfrchx7duf3n-656976819486.asia-southeast1.run.app';
        protocol = 'wss:';
      }

      let wsUrl = `${protocol}//${host}/live?voice=${encodeURIComponent(voice)}`;
      if (memory && memory.length > 0) {
        wsUrl += `&memory=${encodeURIComponent(memory.join('; '))}`;
      }
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = async () => {
        if (visualMemories.length > 0) {
          ws.send(JSON.stringify({ initVisualMemories: visualMemories }));
        }
        setIsConnected(true);
        const audioCtx = new AudioContext({ sampleRate: 16000 });
        audioCtxRef.current = audioCtx;
        nextStartTimeRef.current = audioCtx.currentTime;

        const analyserNode = audioCtx.createAnalyser();
        analyserNode.fftSize = 256;
        setAnalyser(analyserNode);

        const stream = await navigator.mediaDevices.getUserMedia({ 
          audio: true, 
          video: enableCamera ? { facingMode } : false 
        });
        streamRef.current = stream;
        setMediaStream(stream);

        const source = audioCtx.createMediaStreamSource(stream);
        sourceRef.current = source;
        // Optionally connect mic to analyser so the visualizer reacts to user voice too
        source.connect(analyserNode);
        
        if (enableCamera && stream.getVideoTracks().length > 0) {
          const videoElement = document.createElement("video");
          videoElement.autoplay = true;
          videoElement.playsInline = true;
          videoElement.muted = true;
          videoElement.srcObject = stream;
          videoElement.play().catch(e => console.error("Video auto-play failed", e));
          videoRef.current = videoElement;
          
          const canvasElement = document.createElement("canvas");
          const ctx = canvasElement.getContext("2d");
          
          frameIntervalRef.current = window.setInterval(() => {
            if (ws.readyState === WebSocket.OPEN && ctx && videoElement.readyState >= 2 && videoElement.videoWidth > 0) {
              const maxDim = 640;
              let drawWidth = videoElement.videoWidth;
              let drawHeight = videoElement.videoHeight;
              if (drawWidth > maxDim || drawHeight > maxDim) {
                const ratio = Math.min(maxDim / drawWidth, maxDim / drawHeight);
                drawWidth = Math.floor(drawWidth * ratio);
                drawHeight = Math.floor(drawHeight * ratio);
              }
              
              if (canvasElement.width !== drawWidth || canvasElement.height !== drawHeight) {
                canvasElement.width = drawWidth;
                canvasElement.height = drawHeight;
              }
              
              ctx.drawImage(videoElement, 0, 0, drawWidth, drawHeight);
              const dataUrl = canvasElement.toDataURL("image/jpeg", 0.5);
              const base64 = dataUrl.split(",")[1];
              ws.send(JSON.stringify({ video: base64 }));
            }
          }, 1000); // 1 Frame per second
        }

        // 4096 buffer size, 1 input channel, 1 output channel
        const processor = audioCtx.createScriptProcessor(4096, 1, 1);
        processorRef.current = processor;

        source.connect(processor);
        processor.connect(audioCtx.destination);

        processor.onaudioprocess = (e) => {
          if (ws.readyState === WebSocket.OPEN) {
            const base64 = pcmToBase64(e.inputBuffer.getChannelData(0));
            ws.send(JSON.stringify({ audio: base64 }));
          }
        };
      };

      ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        if (msg.error) {
          setError(msg.error);
          stop();
          return;
        }

        if (msg.interrupted) {
          nextStartTimeRef.current = audioCtxRef.current?.currentTime || 0;
        }

        if (msg.text) {
          setMessages((prev) => [
            ...prev,
            { id: Math.random().toString(36).substring(7), text: msg.text, isServer: msg.isServer }
          ]);
        }
        
        if (msg.memoryFact && onMemoryFact) {
          onMemoryFact(msg.memoryFact);
        }

        if (msg.memoryVisual && onMemoryVisual) {
          onMemoryVisual(msg.memoryVisual.label, msg.memoryVisual.image);
        }

        if (msg.audio) {
          const audioCtx = audioCtxRef.current;
          if (!audioCtx) return;

          const audioData = base64ToFloat32Array(msg.audio);
          
          // Gemini Live API returns audio at 24000Hz (24kHz)
          const audioBuffer = audioCtx.createBuffer(1, audioData.length, 24000);
          audioBuffer.getChannelData(0).set(audioData);

          const source = audioCtx.createBufferSource();
          source.buffer = audioBuffer;
          source.connect(audioCtx.destination);
          
          // Connect to analyser as well if we have one defined in lexical scope
          setAnalyser(currentAnalyser => {
             if (currentAnalyser) {
                source.connect(currentAnalyser);
             }
             return currentAnalyser;
          });

          const startTime = Math.max(audioCtx.currentTime, nextStartTimeRef.current);
          source.start(startTime);
          nextStartTimeRef.current = startTime + audioBuffer.duration;
        }
      };

      ws.onclose = () => {
        stop();
      };
      
      ws.onerror = () => {
        setError("WebSocket connection failed.");
        stop();
      };

    } catch (e: any) {
      setError(e.message || "Failed to start audio/microphone.");
      stop();
    }
  }, []);

  const stop = useCallback(() => {
    setIsConnected(false);
    
    if (frameIntervalRef.current) {
      window.clearInterval(frameIntervalRef.current);
      frameIntervalRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
      videoRef.current = null;
    }
    
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }
    if (sourceRef.current) {
      sourceRef.current.disconnect();
      sourceRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    if (audioCtxRef.current) {
      audioCtxRef.current.close();
      audioCtxRef.current = null;
    }
    setMediaStream(null);
    setCameraEnabled(false);
    nextStartTimeRef.current = 0;
  }, []);

  const flipCamera = useCallback(async () => {
    if (!isConnected || !cameraEnabled || !streamRef.current) return;
    
    try {
      const newFacingMode = facingMode === 'user' ? 'environment' : 'user';
      setFacingMode(newFacingMode);
      
      const newStream = await navigator.mediaDevices.getUserMedia({ 
        audio: false, 
        video: { facingMode: newFacingMode } 
      });
      
      const oldVideoTracks = streamRef.current.getVideoTracks();
      oldVideoTracks.forEach(t => {
        t.stop();
        streamRef.current?.removeTrack(t);
      });
      
      newStream.getVideoTracks().forEach(t => {
        streamRef.current?.addTrack(t);
      });
      
      if (videoRef.current) {
        // Just re-assigning srcObject handles the new tracks
        videoRef.current.srcObject = streamRef.current;
      }
    } catch (e) {
      console.error("Failed to flip camera:", e);
    }
  }, [isConnected, cameraEnabled, facingMode]);

  const sendText = useCallback((text: string) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ text }));
      setMessages((prev) => [
        ...prev,
        { id: Math.random().toString(36).substring(7), text, isServer: false }
      ]);
    }
  }, []);

  return { isConnected, start, stop, error, messages, sendText, volume, analyser, mediaStream, cameraEnabled, flipCamera, facingMode };
}
