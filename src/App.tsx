import React, { useState, useRef, useEffect } from 'react';
import { useLiveAPI } from './lib/useLiveAPI';
import { Visualizer } from './components/Visualizer';
import { motion, AnimatePresence } from 'motion/react';
import { Mic, MicOff, AlertCircle, Sparkles, Send, MessageSquare, AudioLines, History, Settings, X, Trash2, LogOut, Mail, Download, Video, VideoOff, Loader2, Search, SwitchCamera } from 'lucide-react';
import { useAuth } from './components/AuthContext';
import AuthScreen from './components/AuthScreen';

const VOICES = [
  { id: 'Aoede', label: 'Aoede (Warm, clear female)' },
  { id: 'Charon', label: 'Charon (Deep, resonant)' },
  { id: 'Fenrir', label: 'Fenrir (Low, authoritative)' },
  { id: 'Kore', label: 'Kore (Sweet, gentle female)' },
  { id: 'Puck', label: 'Puck (Soft, conversational)' },
  { id: 'Zephyr', label: 'Zephyr (Smooth, neutral)' }
];

export default function App() {
  const { user, loading: authLoading, logout, resendVerification } = useAuth();
  const [activeMode, setActiveMode] = useState<'voice' | 'chat'>('voice');

  const [userMemory, setUserMemory] = useState<string[]>([]);
  const [userVisualMemory, setUserVisualMemory] = useState<{label: string, image: string}[]>([]);
  const [showSettings, setShowSettings] = useState(false);
  const [memorySearchTerm, setMemorySearchTerm] = useState('');
  const [showHistory, setShowHistory] = useState(false);
  
  // Voice State
  const [selectedVoice, setSelectedVoice] = useState('Kore');
  const handleMemoryFact = (fact: string) => {
    setUserMemory(prev => {
      if (!prev.includes(fact)) {
        const updated = [...prev, fact];
        localStorage.setItem('patro_memory', JSON.stringify(updated));
        return updated;
      }
      return prev;
    });
  };

  const handleMemoryVisual = (label: string, image: string) => {
    setUserVisualMemory(prev => {
      const existingIdx = prev.findIndex(m => m.label === label);
      let updated;
      if (existingIdx >= 0) {
        updated = [...prev];
        updated[existingIdx] = { label, image };
      } else {
        updated = [...prev, { label, image }];
      }
      try {
        localStorage.setItem('patro_visual_memory', JSON.stringify(updated));
      } catch (err) {
        console.error("Visual memory save error (quota exceeded?):", err);
        // Do not crash the app, but maybe we can't save it
      }
      return updated;
    });
  };

  const { isConnected, start, stop, error, analyser, mediaStream, cameraEnabled, flipCamera, facingMode } = useLiveAPI(handleMemoryFact, handleMemoryVisual);
  const [enableVideo, setEnableVideo] = useState(false);
  const [localVideoPreview, setLocalVideoPreview] = useState<MediaStream | null>(null);
  const [localFacingMode, setLocalFacingMode] = useState<'user' | 'environment'>('user');
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isCameraInitializing, setIsCameraInitializing] = useState(false);

  const toggleVideoPreview = async () => {
    setCameraError(null);
    if (enableVideo) {
      if (localVideoPreview) {
        localVideoPreview.getTracks().forEach(t => t.stop());
        setLocalVideoPreview(null);
      }
      setEnableVideo(false);
    } else {
      setIsCameraInitializing(true);
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: localFacingMode } });
        setLocalVideoPreview(stream);
        setEnableVideo(true);
      } catch (err: any) {
        console.error("Camera access denied", err);
        setCameraError(err.message || "Camera permission denied.");
      } finally {
        setIsCameraInitializing(false);
      }
    }
  };

  const handleFlipCamera = async () => {
    if (isConnected) {
      flipCamera();
    } else if (enableVideo) {
      setIsCameraInitializing(true);
      try {
        const newFacingMode = localFacingMode === 'user' ? 'environment' : 'user';
        setLocalFacingMode(newFacingMode);
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: newFacingMode } });
        if (localVideoPreview) {
          localVideoPreview.getTracks().forEach(t => t.stop());
        }
        setLocalVideoPreview(stream);
      } catch (err: any) {
        console.error("Camera flip failed", err);
      } finally {
        setIsCameraInitializing(false);
      }
    } else {
      setLocalFacingMode(localFacingMode === 'user' ? 'environment' : 'user');
    }
  };

  // Chat State
  const [textInput, setTextInput] = useState('');
  const [chatMessages, setChatMessages] = useState<{id: string, role: 'user'|'model', text: string}[]>([]);
  const [isThinking, setIsThinking] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const [verificationSending, setVerificationSending] = useState(false);
  const [verificationSent, setVerificationSent] = useState(false);

  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showInstallModal, setShowInstallModal] = useState(false);

  // Load persistence
  useEffect(() => {
    const savedMem = localStorage.getItem('patro_memory');
    if (savedMem) {
      setUserMemory(JSON.parse(savedMem));
    }
    const savedVisualMem = localStorage.getItem('patro_visual_memory');
    if (savedVisualMem) {
      try {
        const parsed = JSON.parse(savedVisualMem);
        if (Array.isArray(parsed)) setUserVisualMemory(parsed);
      } catch (e) {
        console.error(e);
      }
    }
    const savedChat = localStorage.getItem('patro_chat');
    if (savedChat) {
      const parsedChat = JSON.parse(savedChat);
      const chatWithIds = parsedChat.map((msg: any, idx: number) => ({
        ...msg,
        id: msg.id || `historical-${idx}-${Date.now()}`
      }));
      setChatMessages(chatWithIds);
    }

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        setDeferredPrompt(null);
      }
    } else {
      setShowInstallModal(true);
    }
  };

  useEffect(() => {
    if (chatMessages.length > 0) {
      localStorage.setItem('patro_chat', JSON.stringify(chatMessages));
    } else {
      localStorage.removeItem('patro_chat');
    }
    if (chatEndRef.current && activeMode === 'chat') {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatMessages, activeMode]);

  const handleResend = async () => {
    try {
      setVerificationSending(true);
      await resendVerification();
      setVerificationSent(true);
    } catch(err) {
      console.error(err);
    } finally {
      setVerificationSending(false);
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <Sparkles className="w-8 h-8 text-zinc-600 animate-pulse" />
      </div>
    );
  }

    if (!user) {
      return <AuthScreen />;
    }

    // Enforce email verification (Google logins are automatically verified)
    /*
    if (!user.emailVerified) {
      return (
        <div className="min-h-screen bg-zinc-950 flex flex-col justify-center py-12 sm:px-6 lg:px-8 font-sans selection:bg-zinc-800 text-zinc-50">
          <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
            <Mail className="mx-auto h-12 w-12 text-zinc-400 mb-4" />
            <h2 className="text-2xl font-medium tracking-tight text-white mb-2">Verify your email</h2>
            <p className="text-sm text-zinc-400 mb-8">
              Please check your inbox (and spam folder) for a verification link to access the app.
            </p>
            <div className="flex flex-col items-center space-y-4">
              <button
                onClick={handleResend}
                disabled={verificationSending || verificationSent}
                className="w-full flex justify-center py-2.5 px-4 border border-white/10 rounded-lg shadow-sm text-sm font-medium text-white bg-zinc-900 hover:bg-zinc-800 disabled:opacity-50 transition-colors"
              >
                {verificationSent ? 'Verification link sent' : (verificationSending ? 'Sending...' : 'Resend verification email')}
              </button>
              <button
                onClick={logout}
                className="text-sm text-zinc-500 hover:text-white transition-colors"
              >
                Sign out
              </button>
            </div>
          </div>
        </div>
      );
    }
    */

  const handleSendChat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!textInput.trim() || isThinking) return;

    const userMessage = textInput.trim();
    setTextInput('');
    const userMsgId = `user-${Date.now()}`;
    const newMessages = [...chatMessages, { id: userMsgId, role: 'user' as const, text: userMessage }];
    setChatMessages(newMessages);
    setIsThinking(true);

    const getBackendUrl = (path: string) => {
      let host = window.location.host;
      let protocol = window.location.protocol;
      if (host.includes('vercel.app')) {
        host = 'ais-pre-ckx5i4qxvstfrchx7duf3n-656976819486.asia-southeast1.run.app';
        protocol = 'https:';
      }
      return `${protocol}//${host}${path}`;
    };

    try {
      const response = await fetch(getBackendUrl('/api/chat'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: newMessages, memory: userMemory })
      });
      const data = await response.json();
      const modelMsgId = `model-${Date.now()}`;
      setChatMessages([...newMessages, { id: modelMsgId, role: 'model', text: data.text || 'Error obtaining response' }]);

      // Background Memory Extraction
      fetch(getBackendUrl('/api/extract-memory'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: userMessage, memory: userMemory })
      }).then(r => r.json()).then(res => {
        if (res.newFacts && res.newFacts.length > 0) {
          const updatedMemory = [...userMemory, ...res.newFacts];
          setUserMemory(updatedMemory);
          localStorage.setItem('patro_memory', JSON.stringify(updatedMemory));
        }
      }).catch(err => console.error("Memory extraction err:", err));

    } catch (err) {
      console.error(err);
      const errorMsgId = `error-${Date.now()}`;
      setChatMessages([...newMessages, { id: errorMsgId, role: 'model', text: 'Error: Failed to connect to server.' }]);
    } finally {
      setIsThinking(false);
    }
  };

  const clearHistory = () => {
    setChatMessages([]);
    localStorage.removeItem('patro_chat');
    setShowHistory(false);
  };

  const removeMemory = (index: number) => {
    const updated = userMemory.filter((_, i) => i !== index);
    setUserMemory(updated);
    localStorage.setItem('patro_memory', JSON.stringify(updated));
  };

  const removeVisualMemory = (index: number) => {
    const updated = userVisualMemory.filter((_, i) => i !== index);
    setUserVisualMemory(updated);
    try {
      localStorage.setItem('patro_visual_memory', JSON.stringify(updated));
    } catch (e) {}
  };


  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-50 flex flex-col p-4 sm:p-8 font-sans selection:bg-zinc-800">
      <div className="w-full max-w-3xl mx-auto flex flex-col relative h-full flex-1">
        
        {/* Header / Mode Switcher */}
        <div className="flex flex-col items-center mb-10 pt-4 text-center space-y-6 relative">
          
          <div className="absolute top-4 left-0 sm:-left-4">
            <button onClick={() => setShowHistory(true)} className="p-2 text-zinc-400 hover:text-white hover:bg-white/10 transition-colors bg-zinc-900/50 rounded-full border border-white/5">
              <History className="w-5 h-5" />
            </button>
          </div>
          <div className="absolute top-4 right-0 sm:-right-4 flex items-center space-x-2">
            <button onClick={handleInstallClick} className="p-2 text-zinc-400 hover:text-white hover:bg-white/10 transition-colors bg-zinc-900/50 rounded-full border border-white/5" title="Install App">
              <Download className="w-5 h-5" />
            </button>
            <button onClick={() => setShowSettings(true)} className="p-2 text-zinc-400 hover:text-white hover:bg-white/10 transition-colors bg-zinc-900/50 rounded-full border border-white/5">
              <Settings className="w-5 h-5" />
            </button>
            <button onClick={logout} className="p-2 text-zinc-400 hover:text-red-400 hover:bg-white/10 transition-colors bg-zinc-900/50 rounded-full border border-white/5" title="Sign Out">
              <LogOut className="w-5 h-5" />
            </button>
          </div>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
          >
            <h1 className="text-3xl font-medium tracking-tight text-white mb-2">
              PatroParadax
            </h1>
            <p className="text-zinc-400 text-sm tracking-wide font-light">
              {activeMode === 'voice' ? 'Real-time Voice Assistant' : 'Intelligent Text Chat'}
            </p>
          </motion.div>

          <div className="flex bg-zinc-900 rounded-full p-1 border border-white/5 shadow-xl">
            <button
              onClick={() => {
                if (isConnected) stop();
                setActiveMode('voice');
              }}
              className={`flex items-center px-6 py-2 rounded-full text-sm font-medium transition-all ${activeMode === 'voice' ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-400 hover:text-zinc-200'}`}
            >
              <AudioLines className="w-4 h-4 mr-2" />
              Voice API
            </button>
            <button
              onClick={() => {
                if (isConnected) stop();
                setActiveMode('chat');
              }}
              className={`flex items-center px-6 py-2 rounded-full text-sm font-medium transition-all ${activeMode === 'chat' ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-400 hover:text-zinc-200'}`}
            >
              <MessageSquare className="w-4 h-4 mr-2" />
              Standard Chat
            </button>
          </div>
        </div>

        {/* VOICE MODE */}
        {activeMode === 'voice' && (
          <div className="flex flex-col items-center flex-1 justify-center pb-20">
            <div className="w-full flex justify-center mb-16">
              <div className="relative inline-flex items-center bg-white/5 border border-white/10 rounded-full px-4 py-2 transition-all">
                <Sparkles className="w-4 h-4 text-zinc-400 mr-2" />
                <select
                  value={selectedVoice}
                  onChange={(e) => setSelectedVoice(e.target.value)}
                  disabled={isConnected}
                  className="bg-transparent text-zinc-300 text-sm focus:outline-none appearance-none pr-4 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed outline-none"
                >
                  {VOICES.map(v => (
                    <option key={v.id} value={v.id} className="bg-zinc-900 text-white">{v.label}</option>
                  ))}
                </select>
              </div>
            </div>

            <AnimatePresence>
              {enableVideo && (
                <motion.div 
                  initial={{ opacity: 0, height: 0, marginBottom: 0 }}
                  animate={{ opacity: 1, height: 'auto', marginBottom: 32 }}
                  exit={{ opacity: 0, height: 0, marginBottom: 0 }}
                  className="flex flex-col items-center justify-center overflow-hidden"
                >
                  <div className="relative w-48 h-48 sm:w-64 sm:h-64 rounded-3xl overflow-hidden border border-white/10 bg-zinc-900/50 flex flex-col items-center justify-center shadow-2xl">
                    <AnimatePresence>
                      {isCameraInitializing && (
                        <motion.div 
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-zinc-900/90 backdrop-blur-sm"
                        >
                           <Loader2 className="w-6 h-6 mb-2 text-white animate-spin" />
                           <span className="text-[10px] uppercase tracking-wider font-mono text-zinc-400 mt-1">Starting</span>
                        </motion.div>
                      )}
                    </AnimatePresence>
                    {((mediaStream && cameraEnabled) || localVideoPreview) ? (
                      <video
                        autoPlay
                        playsInline
                        muted
                        className="absolute inset-0 w-full h-full object-cover"
                        ref={(el) => {
                          const streamToPlay = (mediaStream && cameraEnabled) ? mediaStream : localVideoPreview;
                          if (el && streamToPlay && el.srcObject !== streamToPlay) {
                            el.srcObject = streamToPlay;
                          }
                        }}
                      />
                    ) : null}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="relative flex flex-col justify-center items-center w-full mb-8 min-h-[160px]">
              <div className="relative mb-6 flex items-center justify-center">
                {isConnected && (
                  <motion.div
                    className="absolute w-40 h-40 bg-white/5 rounded-full pointer-events-none"
                    animate={{ scale: [1, 1.3, 1], opacity: [0.5, 0, 0.5] }}
                    transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                  />
                )}
                {isConnected && (
                  <motion.div
                    className="absolute w-40 h-40 bg-white/10 rounded-full pointer-events-none"
                    animate={{ scale: [1, 1.2, 1], opacity: [0.8, 0, 0.8] }}
                    transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut", delay: 0.2 }}
                  />
                )}
                <div className="relative w-28 h-28 flex items-center justify-center rounded-full transition-all duration-300 z-10">
                  <button
                    onClick={() => {
                      if (isCameraInitializing) return;
                      if (isConnected) {
                        stop();
                      } else {
                        start(selectedVoice, userMemory, enableVideo, userVisualMemory);
                        setLocalVideoPreview(null); // Clear preview, useLiveAPI manages it now
                      }
                    }}
                    disabled={isCameraInitializing}
                    className={`relative z-10 flex items-center justify-center w-full h-full rounded-full transition-all duration-300 border border-white/10
                      ${isConnected 
                        ? 'bg-red-500/10 text-red-400 hover:bg-red-500/20 shadow-[0_0_40px_rgba(239,68,68,0.2)] border-red-500/30 hover:border-red-500/50' 
                        : isCameraInitializing
                        ? 'bg-zinc-800/50 text-white/50 cursor-not-allowed'
                        : 'bg-zinc-800/80 text-white hover:bg-zinc-700/80 hover:shadow-[0_0_30px_rgba(255,255,255,0.1)]'
                      }`}
                  >
                    {isConnected ? (
                      <MicOff className="w-10 h-10" strokeWidth={1.5} />
                    ) : (
                      <Mic className="w-10 h-10" strokeWidth={1.5} />
                    )}
                  </button>
                </div>
                
                <div className="absolute -right-20 top-1/2 -translate-y-1/2 flex flex-col gap-2">
                  <button
                    onClick={toggleVideoPreview}
                    disabled={isConnected || isCameraInitializing}
                    className={`p-3 rounded-full transition-colors ${enableVideo ? 'bg-zinc-200 text-black' : 'bg-zinc-900 text-zinc-400 border border-white/5 hover:bg-white/5'} disabled:opacity-50 disabled:cursor-not-allowed`}
                    title={enableVideo ? "Disable Camera" : "Enable Camera"}
                  >
                    {enableVideo ? <Video className="w-5 h-5" /> : <VideoOff className="w-5 h-5" />}
                  </button>
                  {((enableVideo && !isConnected) || (cameraEnabled && isConnected)) && (
                    <button
                      onClick={handleFlipCamera}
                      disabled={isCameraInitializing}
                      className="p-3 rounded-full bg-zinc-900 text-zinc-400 border border-white/5 hover:text-white hover:bg-white/5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      title="Flip Camera"
                    >
                      <SwitchCamera className="w-5 h-5" />
                    </button>
                  )}
                </div>
              </div>

              <div className="h-16 w-64 flex items-center justify-center pointer-events-none">
                 {isConnected && <Visualizer analyser={analyser} />}
              </div>
            </div>

            <motion.div
              animate={{ opacity: 1 }}
              className="h-14 flex items-center justify-center"
            >
              {cameraError ? (
                <div className="flex flex-col items-center justify-center text-red-400 text-sm bg-red-500/10 px-4 py-2 mx-auto rounded-full border border-red-500/20 max-w-[90%]">
                  <div className="flex items-center">
                    <AlertCircle className="w-4 h-4 mr-2" />
                    <span>{cameraError}</span>
                  </div>
                  <span className="text-xs mt-1 text-red-400/80">Please reload the page & allow camera.</span>
                </div>
              ) : error ? (
                <div className="flex items-center text-red-400 text-sm bg-red-500/10 px-4 py-2 rounded-full border border-red-500/20">
                  <AlertCircle className="w-4 h-4 mr-2" />
                  <span>{error}</span>
                </div>
              ) : (
                <p className={`text-sm font-mono tracking-wider uppercase ${isConnected ? 'text-green-400' : 'text-zinc-500'}`}>
                  {isConnected ? 'Listening & Speaking...' : 'Tap to connect'}
                </p>
              )}
            </motion.div>
          </div>
        )}

        {/* CHAT MODE */}
        {activeMode === 'chat' && (
          <div className="flex-1 flex flex-col w-full min-h-[50vh] relative pb-24">
            <div className="flex-1 overflow-y-auto mb-4 space-y-6 pr-2 scrollbar-thin scrollbar-thumb-zinc-800 pb-20">
              {chatMessages.length === 0 ? (
                <div className="flex-1 h-full flex items-center justify-center text-zinc-600 text-sm font-light relative top-20">
                  Send a message to start chatting.
                </div>
              ) : (
                <AnimatePresence initial={false}>
                  {chatMessages.map((msg) => {
                    const isSrv = msg.role === 'model';
                    return (
                      <motion.div
                        key={msg.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className={`flex flex-col ${isSrv ? 'items-start' : 'items-end'}`}
                      >
                        <div className={`flex max-w-[85%] ${isSrv ? 'flex-row' : 'flex-row-reverse'}`}>
                          <div className={`px-4 py-3 rounded-2xl ${isSrv ? 'bg-zinc-900 text-zinc-300 rounded-tl-sm' : 'bg-white text-zinc-900 rounded-tr-sm'}`}>
                            <p className="text-[15px] leading-relaxed whitespace-pre-wrap">{msg.text}</p>
                          </div>
                        </div>
                      </motion.div>
                    );
                  })}
                  {isThinking && (
                    <motion.div
                      key="thinking-indicator"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="flex flex-col items-start"
                    >
                      <div className="px-4 py-3 rounded-2xl bg-zinc-900 text-zinc-400 rounded-tl-sm flex items-center space-x-2">
                        <div className="w-2 h-2 bg-zinc-500 rounded-full animate-bounce" />
                        <div className="w-2 h-2 bg-zinc-500 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }} />
                        <div className="w-2 h-2 bg-zinc-500 rounded-full animate-bounce" style={{ animationDelay: '0.4s' }} />
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              )}
              <div ref={chatEndRef} />
            </div>

            <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-zinc-950 via-zinc-950 to-transparent">
              <form onSubmit={handleSendChat} className="flex w-full items-center space-x-4 bg-zinc-900 p-2 pl-4 rounded-full border border-white/5 backdrop-blur-md shadow-2xl">
                <input
                  type="text"
                  value={textInput}
                  onChange={(e) => setTextInput(e.target.value)}
                  disabled={isThinking}
                  placeholder="Message Patro..."
                  className="w-full bg-transparent border-none text-zinc-200 placeholder-zinc-500 focus:outline-none focus:ring-0 text-[15px] disabled:opacity-50"
                />
                <button
                  type="submit"
                  disabled={isThinking || !textInput.trim()}
                  className="w-10 h-10 flex flex-shrink-0 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  <Send className="w-4 h-4 ml-0.5" />
                </button>
              </form>
            </div>
          </div>
        )}

        {/* MODALS */}
        <AnimatePresence>
          {showHistory && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-950/80 backdrop-blur-sm">
              <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} className="bg-zinc-900 border border-white/10 rounded-2xl p-6 w-full max-w-md shadow-2xl relative">
                <button onClick={() => setShowHistory(false)} className="absolute top-4 right-4 text-zinc-400 hover:text-white">
                  <X className="w-5 h-5" />
                </button>
                <h2 className="text-xl font-medium text-white mb-4">Chat History</h2>
                <p className="text-zinc-400 text-sm mb-6 pb-4 border-b border-white/5">
                  Your chat logs are stored locally.
                </p>
                <div className="flex justify-end space-x-3">
                  <button onClick={() => setShowHistory(false)} className="px-4 py-2 text-sm font-medium text-zinc-300 hover:bg-white/5 rounded-lg transition-colors">
                    Close
                  </button>
                  <button onClick={clearHistory} className="px-4 py-2 text-sm font-medium bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/20 rounded-lg transition-colors">
                    Clear History
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

          <AnimatePresence>
            {showInstallModal && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
              >
                <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 w-full max-w-sm text-center relative shadow-2xl">
                  <button onClick={() => setShowInstallModal(false)} className="absolute top-4 right-4 text-zinc-400 hover:text-white">
                    <X className="w-5 h-5" />
                  </button>
                  <div className="w-16 h-16 bg-zinc-800 rounded-2xl mx-auto flex items-center justify-center mb-4">
                     <Download className="w-8 h-8 text-white relative z-10" />
                  </div>
                  <h2 className="text-xl font-medium text-white mb-2">Install App</h2>
                  <p className="text-zinc-400 text-sm mb-6 text-left">
                    PatroParadax is a modern Web App. To install it directly on your phone:
                  </p>
                  <div className="text-left text-sm text-zinc-300 space-y-4">
                     <div className="bg-zinc-800/50 p-4 rounded-xl border border-white/5">
                       <strong className="text-white block mb-1">On Android (Chrome)</strong>
                       Tap the 3-dots menu <span className="font-bold border border-zinc-600 rounded px-1 text-xs">⋮</span> in the top right, then select <strong className="text-white">"Install app"</strong> or <strong className="text-white">"Add to Home screen"</strong>.
                     </div>
                     <div className="bg-zinc-800/50 p-4 rounded-xl border border-white/5">
                       <strong className="text-white block mb-1">On iPhone (Safari)</strong>
                       Tap the Share icon <span className="font-bold border border-zinc-600 rounded px-1 text-xs">⎙</span> at the bottom, then scroll down and select <strong className="text-white">"Add to Home Screen"</strong>.
                     </div>
                  </div>
                  <button onClick={() => setShowInstallModal(false)} className="mt-8 w-full py-3 bg-white text-black font-medium rounded-xl hover:bg-zinc-200 transition-colors">
                    Got it
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {showSettings && (() => {
              const filteredMemory = userMemory.filter(m => m.toLowerCase().includes(memorySearchTerm.toLowerCase()));
              const filteredVisualMemory = userVisualMemory.filter(m => m.label.toLowerCase().includes(memorySearchTerm.toLowerCase()));
              
              return (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-950/80 backdrop-blur-sm">
                <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} className="bg-zinc-900 border border-white/10 rounded-2xl p-6 w-full max-w-md shadow-2xl relative flex flex-col max-h-[90vh]">
                  <button onClick={() => setShowSettings(false)} className="absolute top-4 right-4 text-zinc-400 hover:text-white">
                    <X className="w-5 h-5" />
                  </button>
                  <h2 className="text-xl font-medium text-white mb-2 shrink-0">Memory Settings</h2>
                  <p className="text-zinc-400 text-sm mb-4 shrink-0">
                    Patro learns about you over time across chats. Here is what I remember:
                  </p>

                  <div className="relative mb-4 shrink-0">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <Search className="h-4 w-4 text-zinc-500" />
                    </div>
                    <input
                      type="text"
                      placeholder="Search memories..."
                      value={memorySearchTerm}
                      onChange={(e) => setMemorySearchTerm(e.target.value)}
                      className="bg-zinc-950 block w-full pl-9 pr-3 py-2 border border-white/10 rounded-lg text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 transition-colors"
                    />
                  </div>
                  
                  <div className="space-y-3 mb-6 overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-zinc-700 grow">
                    {filteredMemory.length === 0 && filteredVisualMemory.length === 0 ? (
                      <div className="text-zinc-500 text-sm italic py-4 text-center border border-dashed border-white/10 rounded-xl">
                        {memorySearchTerm ? "No matching memories found." : "No memories yet. Start chatting to teach me!"}
                      </div>
                    ) : (
                      <>
                        {filteredMemory.map((mem, i) => {
                          const originalIndex = userMemory.indexOf(mem);
                          return (
                            <div key={`mem-${originalIndex}`} className="flex items-start justify-between bg-zinc-950 p-3 rounded-xl border border-white/5">
                              <span className="text-zinc-300 text-sm leading-relaxed pr-3">{mem}</span>
                              <button onClick={() => removeMemory(originalIndex)} className="text-zinc-500 hover:text-red-400 bg-zinc-900 hover:bg-zinc-800 rounded-lg transition-colors p-2 flex-shrink-0">
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          );
                        })}
                        {filteredVisualMemory.map((mem, i) => {
                          const originalIndex = userVisualMemory.indexOf(mem);
                          return (
                            <div key={`vis-${originalIndex}`} className="flex items-center justify-between bg-zinc-950 p-3 rounded-xl border border-white/5">
                              <div className="flex items-center gap-3 overflow-hidden">
                                <div className="w-12 h-12 rounded-lg overflow-hidden bg-zinc-900 border border-white/10 flex-shrink-0">
                                  <img src={`data:image/jpeg;base64,${mem.image}`} alt={mem.label} className="w-full h-full object-cover" />
                                </div>
                                <span className="text-zinc-300 text-sm leading-relaxed truncate">{mem.label}</span>
                              </div>
                              <button onClick={() => removeVisualMemory(originalIndex)} className="text-zinc-500 hover:text-red-400 bg-zinc-900 hover:bg-zinc-800 rounded-lg transition-colors p-2 flex-shrink-0 ml-3">
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          );
                        })}
                      </>
                    )}
                  </div>

                  <div className="flex justify-end shrink-0">
                    <button onClick={() => setShowSettings(false)} className="px-5 py-2 text-sm font-medium bg-white text-zinc-900 hover:bg-zinc-200 rounded-lg transition-colors">
                      Done
                    </button>
                  </div>
                </motion.div>
              </motion.div>
            )
            })()}
          </AnimatePresence>

      </div>
    </div>
  );
}

