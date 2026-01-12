import React, { useState, useRef, useEffect } from 'react';
import { orchestratorService } from '../services/orchestratorService';
import { ChatMessage, AnalysisPhase, UnifiedInput, Submission } from '../types';
import { AnalysisCard } from './ResultsView';
import { OrchestratorDisplay } from './OrchestratorDisplay';

interface WorkspaceProps {
  isGuest: boolean;
  initialSubmission?: Submission;
}

const SimpleFormatter: React.FC<{ text: string }> = ({ text }) => {
  if (!text) return null;
  const parts = text.split(/(\*\*.*?\*\*)/g);
  return (
    <div className="whitespace-pre-wrap leading-relaxed">
      {parts.map((part, i) => {
        if (part.startsWith('**') && part.endsWith('**')) {
          return <strong key={i} className="text-white font-semibold">{part.slice(2, -2)}</strong>;
        }
        return <span key={i}>{part}</span>;
      })}
    </div>
  );
};

export const Workspace: React.FC<WorkspaceProps> = ({ isGuest, initialSubmission }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentPhase, setCurrentPhase] = useState<AnalysisPhase>(AnalysisPhase.IDLE);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // LIFECYCLE: Manage Session Scope
  useEffect(() => {
    // 1. Reset Orchestrator
    orchestratorService.resetSession();

    // 2. Hydrate History if provided
    if (initialSubmission && initialSubmission.result) {
        setMessages([
            {
                id: 'history-user',
                role: 'user',
                type: 'text',
                content: `[Loaded Submission]\nFile: ${initialSubmission.fileName || 'Untitled'}`
            },
            {
                id: 'history-model-card',
                role: 'model',
                type: 'analysis',
                analysisResult: initialSubmission.result,
                content: '',
                phase: AnalysisPhase.COMPLETE
            },
            {
                id: 'history-model-text',
                role: 'model',
                type: 'text',
                content: 'I have loaded your previous analysis. How would you like to proceed?'
            }
        ]);
    }

    return () => {
        orchestratorService.resetSession();
    }
  }, [isGuest, initialSubmission]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, currentPhase]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
      setSelectedFile(e.target.files[0]);
    }
  };

  const handleSend = async () => {
    if ((!inputValue.trim() && !selectedFile) || isProcessing) return;

    const inputPayload: UnifiedInput = {
        text: inputValue,
        file: selectedFile || undefined
    };

    // UI State Update (Optimistic)
    setInputValue('');
    setSelectedFile(null);
    setIsProcessing(true);

    // Add User Message
    const userMsgId = crypto.randomUUID();
    const userMsg: ChatMessage = {
      id: userMsgId,
      role: 'user',
      type: 'text',
      content: inputPayload.file ? `[Uploaded: ${inputPayload.file.name}]\n${inputPayload.text}` : inputPayload.text
    };
    setMessages(prev => [...prev, userMsg]);

    // Prepare placeholder for response
    const responseId = crypto.randomUUID();
    setMessages(prev => [...prev, {
        id: responseId,
        role: 'model',
        type: 'text', // Default to text, might change to analysis
        content: '',
        phase: inputPayload.file ? AnalysisPhase.PROCESSING : undefined,
        isStreaming: true
    }]);

    try {
        // --- DELEGATE TO ORCHESTRATOR ---
        // UI does not know about pipelines. It only knows about events.
        const eventStream = orchestratorService.processInput(inputPayload, isGuest);
        
        let fullTextBuffer = '';

        for await (const event of eventStream) {
            switch(event.type) {
                case 'PHASE_UPDATE':
                    setCurrentPhase(event.phase);
                    setMessages(prev => prev.map(m => m.id === responseId ? { ...m, phase: event.phase } : m));
                    break;

                case 'STREAM_CHUNK':
                    fullTextBuffer += event.text;
                    setMessages(prev => prev.map(m => m.id === responseId ? { ...m, content: fullTextBuffer } : m));
                    break;
                
                case 'SUBMISSION_COMPLETE':
                    setMessages(prev => prev.map(m => m.id === responseId ? {
                        ...m,
                        type: 'analysis',
                        analysisResult: event.submission.result,
                        content: '', // Clear content for card view
                        phase: AnalysisPhase.COMPLETE
                    } : m));
                    break;
                
                case 'FOLLOW_UP':
                    setMessages(prev => [...prev, {
                        id: crypto.randomUUID(),
                        role: 'model',
                        type: 'text',
                        content: event.text
                    }]);
                    break;

                case 'ERROR':
                    setMessages(prev => prev.map(m => m.id === responseId ? {
                        ...m,
                        type: 'error',
                        content: event.message,
                        isStreaming: false
                    } : m));
                    break;
                
                case 'TASK_COMPLETE':
                     // Just ensures streaming flag is off
                     break;
            }
        }
        
        setMessages(prev => prev.map(m => m.id === responseId ? { ...m, isStreaming: false } : m));

    } catch (e) {
        console.error(e);
        setMessages(prev => prev.map(m => m.id === responseId ? { 
            ...m, 
            type: 'error', 
            content: "An unexpected error occurred.", 
            isStreaming: false 
        } : m));
    } finally {
        setIsProcessing(false);
        setCurrentPhase(AnalysisPhase.IDLE);
        setTimeout(() => inputRef.current?.focus(), 100);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex flex-col h-full w-full max-w-4xl mx-auto animate-fade-in relative">
      
      {/* 1. Chat Stream - Flexible Grow Area */}
      <div className="flex-grow overflow-y-auto min-h-0 pt-6 pb-2 px-4 md:px-8 space-y-6 custom-scrollbar">
        {messages.map((msg) => (
            <div key={msg.id} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                {/* Orchestrator Loading State (Visual Only) */}
                {msg.phase && msg.phase !== AnalysisPhase.COMPLETE && msg.phase !== AnalysisPhase.ERROR && msg.phase !== AnalysisPhase.IDLE && (
                    <OrchestratorDisplay phase={msg.phase} />
                )}

                {/* Analysis Result Card */}
                {msg.type === 'analysis' && msg.analysisResult && (
                    <AnalysisCard result={msg.analysisResult} />
                )}

                {/* Text Message Bubble (Learning Task Output + Follow-ups) */}
                {msg.type === 'text' && msg.content && (
                    <div 
                        className={`
                            max-w-[90%] md:max-w-[80%] rounded-2xl px-5 py-3 text-sm md:text-base border shadow-sm
                            ${msg.role === 'user' 
                                ? 'bg-brand-surface border-brand-border/50 text-white rounded-br-none' 
                                : 'bg-brand-card/80 border-brand-border/30 text-brand-text rounded-bl-none'
                            }
                        `}
                    >
                         {msg.role === 'user' ? (
                            <p className="whitespace-pre-wrap">{msg.content}</p>
                         ) : (
                            <SimpleFormatter text={msg.content} />
                         )}
                    </div>
                )}
                
                {/* Error Bubble */}
                {msg.type === 'error' && (
                    <div className="text-red-400 text-sm bg-red-900/10 border border-red-500/20 px-4 py-2 rounded-xl">
                        {msg.content}
                    </div>
                )}
            </div>
        ))}
        <div ref={messagesEndRef} />
        
        {/* Helpful Hint (Only on empty state) */}
        {messages.length === 0 && (
            <div className="h-full flex flex-col items-center justify-center text-center p-6 opacity-60">
                <div className="w-16 h-16 bg-brand-surface rounded-2xl flex items-center justify-center mb-6 text-brand-teal">
                    <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" /></svg>
                </div>
                <h3 className="text-xl font-medium text-white mb-2">How can I help you?</h3>
                <p className="text-brand-muted max-w-sm">
                   Upload your homework for feedback, or ask me to generate practice questions.
                </p>
            </div>
        )}
      </div>

      {/* 2. Input Composer - Pinned Bottom */}
      <div className="flex-none p-4 pb-6 md:pb-8 w-full max-w-3xl mx-auto z-10">
        <div className="bg-brand-card border border-brand-border rounded-2xl p-2 shadow-2xl flex items-end gap-2 transition-all focus-within:ring-1 focus-within:ring-brand-teal/50 focus-within:border-brand-teal/50">
            
            {/* File Upload Button */}
            <div className="relative flex-shrink-0">
                <input 
                    type="file" 
                    ref={fileInputRef}
                    className="hidden" 
                    accept="image/png, image/jpeg, image/webp, application/pdf"
                    onChange={handleFileSelect}
                />
                <button 
                    onClick={() => fileInputRef.current?.click()}
                    className={`p-3 rounded-xl transition-colors flex items-center justify-center ${selectedFile ? 'bg-brand-teal/20 text-brand-teal' : 'text-brand-muted hover:bg-brand-surface hover:text-white'}`}
                    title="Upload work"
                >
                    {selectedFile ? (
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                    ) : (
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" /></svg>
                    )}
                </button>
                {selectedFile && (
                    <div className="absolute -top-12 left-0 bg-brand-surface border border-brand-border text-xs text-white px-3 py-1.5 rounded-lg shadow-lg truncate max-w-[200px] flex items-center gap-2">
                        <span className="truncate">{selectedFile.name}</span>
                        <button onClick={(e) => { e.stopPropagation(); setSelectedFile(null); }} className="hover:text-red-400">×</button>
                    </div>
                )}
            </div>

            {/* Text Input */}
            <textarea
                ref={inputRef}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={selectedFile ? "Add specific instructions..." : "Message Eduvane..."}
                className="flex-grow bg-transparent text-white py-3 px-2 outline-none resize-none placeholder-brand-muted/50 max-h-32 min-h-[48px]"
                rows={1}
            />

            {/* Send Button */}
            <button
                onClick={handleSend}
                disabled={( !inputValue.trim() && !selectedFile ) || isProcessing}
                className="p-3 flex-shrink-0 bg-brand-teal text-brand-bg rounded-xl transition-transform active:scale-95 disabled:opacity-50 disabled:bg-brand-surface disabled:text-brand-muted disabled:scale-100"
            >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>
            </button>
        </div>
        <div className="text-center mt-2">
            <p className="text-[10px] text-brand-muted opacity-40">
                Eduvane AI can make mistakes. Check important info.
            </p>
        </div>
      </div>
    </div>
  );
};