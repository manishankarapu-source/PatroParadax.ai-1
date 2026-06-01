import React, { useState, useRef, useEffect } from 'react';
import { useLiveAPI } from './lib/useLiveAPI';
import { motion, AnimatePresence } from 'motion/react';
import { Mic, MicOff, AlertCircle, Sparkles, Send, MessageSquare, AudioLines, History, Settings, X, Trash2, LogOut, Mail } from 'lucide-react';
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
  const [showSettings, setShowSettings] = useState(false);
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
  const { isConnected, start, stop, error } = useLiveAPI(handleMemoryFact);

  // Chat State
  const [textInput, setTextInput] = useState('');
  const [chatMessages, setChatMessages] = useState<{role: 'user'|'model', text: string}[]>([]);
  const [isThinking, setIsThinking] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const [verificationSending, setVerificationSending] = useState(false);
  const [verificationSent, setVerificationSent] = useState(false);

  // Load persistence
  useEffect(() => {
    const savedMem = localStorage.getItem('patro_memory');
    if (savedMem) {
      setUserMemory(JSON.parse(savedMem));
    }
    const savedChat = localStorage.getItem('patro_chat');
    if (savedChat) {
      setChatMessages(JSON.parse(savedChat));
    }
  }, []);

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

    // Bypassing authentication entirely for ease of use
    // if (!user) {
    //   return <AuthScreen />;
    // }

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
    const newMessages = [...chatMessages, { role: 'user' as const, text: userMessage }];
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
      setChatMessages([...newMessages, { role: 'model', text: data.text || 'Error obtaining response' }]);

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
      setChatMessages([...newMessages, { role: 'model', text: 'Error: Failed to connect to server.' }]);
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

            <div className="relative flex justify-center items-center w-full mb-12 min-h-[240px]">
              {isConnected && (
                <motion.div
                  className="absolute w-48 h-48 bg-white/5 rounded-full"
                  animate={{ scale: [1, 1.5, 1], opacity: [0.5, 0, 0.5] }}
                  transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                />
              )}
              {isConnected && (
                <motion.div
                  className="absolute w-48 h-48 bg-white/10 rounded-full"
                  animate={{ scale: [1, 1.3, 1], opacity: [0.8, 0, 0.8] }}
                  transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut", delay: 0.2 }}
                />
              )}
              
              <button
                onClick={() => isConnected ? stop() : start(selectedVoice, userMemory)}
                className={`relative z-10 flex items-center justify-center w-28 h-28 rounded-full transition-all duration-300 backdrop-blur-sm
                  ${isConnected 
                    ? 'bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/30 shadow-[0_0_40px_rgba(239,68,68,0.2)]' 
                    : 'bg-white/5 text-white hover:bg-white/10 border border-white/10 hover:border-white/30 hover:shadow-[0_0_30px_rgba(255,255,255,0.1)]'
                  }`}
              >
                {isConnected ? (
                  <MicOff className="w-10 h-10" strokeWidth={1.5} />
                ) : (
                  <Mic className="w-10 h-10" strokeWidth={1.5} />
                )}
              </button>
            </div>

            <motion.div
              animate={{ opacity: 1 }}
              className="h-10 flex items-center justify-center"
            >
              {error ? (
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
                  {chatMessages.map((msg, i) => {
                    const isSrv = msg.role === 'model';
                    return (
                      <motion.div
                        key={i}
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

          {showSettings && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-950/80 backdrop-blur-sm">
              <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} className="bg-zinc-900 border border-white/10 rounded-2xl p-6 w-full max-w-md shadow-2xl relative">
                <button onClick={() => setShowSettings(false)} className="absolute top-4 right-4 text-zinc-400 hover:text-white">
                  <X className="w-5 h-5" />
                </button>
                <h2 className="text-xl font-medium text-white mb-2">Memory Settings</h2>
                <p className="text-zinc-400 text-sm mb-6">
                  Patro learns about you over time across chats. Here is what I remember:
                </p>
                
                <div className="space-y-3 mb-6 max-h-[40vh] overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-zinc-700">
                  {userMemory.length === 0 ? (
                    <div className="text-zinc-500 text-sm italic py-4 text-center border border-dashed border-white/10 rounded-xl">
                      No memories yet. Start chatting to teach me!
                    </div>
                  ) : (
                    userMemory.map((mem, i) => (
                      <div key={i} className="flex items-start justify-between bg-zinc-950 p-3 rounded-xl border border-white/5 group">
                        <span className="text-zinc-300 text-sm leading-relaxed pr-3">{mem}</span>
                        <button onClick={() => removeMemory(i)} className="text-zinc-500 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100 p-1">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))
                  )}
                </div>

                <div className="flex justify-end">
                  <button onClick={() => setShowSettings(false)} className="px-5 py-2 text-sm font-medium bg-white text-zinc-900 hover:bg-zinc-200 rounded-lg transition-colors">
                    Done
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

      </div>
    </div>
  );
}

