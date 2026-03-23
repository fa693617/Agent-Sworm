import { useState, useRef, useEffect, useCallback, Component, ReactNode } from "react";
import { GoogleGenAI } from "@google/genai";
import Markdown from 'react-markdown';
import { 
  Copy, Check, Send, Plus, Search, Settings, LogOut, 
  ChevronLeft, ChevronRight, MessageSquare, User, Trash2, 
  MoreHorizontal, X, ArrowRight, Bot, Sparkles, AlertCircle,
  ChevronDown, RefreshCw, XCircle
} from 'lucide-react';
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  onAuthStateChanged, 
  signOut,
  updateProfile,
  GoogleAuthProvider,
  signInWithPopup
} from "firebase/auth";
import { 
  collection, 
  doc, 
  setDoc, 
  getDoc, 
  getDocs, 
  query, 
  where, 
  onSnapshot, 
  deleteDoc, 
  orderBy,
  limit,
  Timestamp,
  runTransaction
} from "firebase/firestore";
import { auth, db } from "./firebase";

const C = {
  sideBg:"var(--side-bg)", mainBg:"var(--main-bg)", surf:"var(--surf)", surf2:"var(--surf2)",
  bdr:"var(--bdr)", bdr2:"var(--bdr2)",
  txt:"var(--txt)", txt2:"var(--txt2)", txt3:"var(--txt3)",
  acc:"var(--acc)", accBg:"var(--acc-bg)", accBdr:"var(--acc-bdr)",
  r:"14px", rMd:"10px", rSm:"7px",
};
const PALETTES=[
  {fg:"#da7756",bg:"rgba(218,119,86,0.12)",bdr:"rgba(218,119,86,0.3)"},
  {fg:"#5b9cf5",bg:"rgba(91,156,245,0.12)",bdr:"rgba(91,156,245,0.3)"},
  {fg:"#19c37d",bg:"rgba(25,195,125,0.12)",bdr:"rgba(25,195,125,0.3)"},
  {fg:"#c9a03a",bg:"rgba(201,160,58,0.12)",bdr:"rgba(201,160,58,0.3)"},
  {fg:"#9b7ff5",bg:"rgba(155,127,245,0.12)",bdr:"rgba(155,127,245,0.3)"},
  {fg:"#f56592",bg:"rgba(245,101,146,0.12)",bdr:"rgba(245,101,146,0.3)"},
  {fg:"#3ecfcf",bg:"rgba(62,207,207,0.12)",bdr:"rgba(62,207,207,0.3)"},
  {fg:"#aac43a",bg:"rgba(170,196,58,0.12)",bdr:"rgba(170,196,58,0.3)"},
];
const pal=idx=>PALETTES[idx%PALETTES.length];

// ── Error Handling ────────────────────────────────────────────────────────
enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

class ErrorBoundary extends Component<{children: ReactNode}, {hasError: boolean, error: any}> {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) { return { hasError: true, error }; }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{padding: "2rem", background: C.mainBg, color: C.txt, height: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center"}}>
          <h2 style={{marginBottom: "1rem"}}>Something went wrong</h2>
          <pre style={{background: C.surf, padding: "1rem", borderRadius: C.rMd, fontSize: "12px", maxWidth: "100%", overflowX: "auto", color: "#f6465d"}}>
            {this.state.error?.message || String(this.state.error)}
          </pre>
          <button className="btn btn-acc" style={{marginTop: "1rem"}} onClick={() => window.location.reload()}>Reload App</button>
        </div>
      );
    }
    return this.props.children;
  }
}

// ── Provider catalogue ────────────────────────────────────────────────────
const PROVIDERS_CATALOGUE = [
  {
    id:"openai", name:"OpenAI", logo:"O", color:"#19c37d", colorBg:"rgba(25,195,125,0.12)", colorBdr:"rgba(25,195,125,0.3)",
    apiType:"openai", endpoint:"https://api.openai.com/v1/chat/completions",
    keyHint:"Get API key at platform.openai.com → API Keys", keyLink:"https://platform.openai.com/api-keys",
    about:"The industry standard. GPT-4o is their best everyday model. o1 for complex reasoning.",
    models:[
      {id:"gpt-4o",        label:"GPT-4o",         desc:"Omni model · fast & smart"},
      {id:"gpt-4o-mini",   label:"GPT-4o mini",    desc:"Efficient · great for simple tasks"},
      {id:"o1",            label:"o1",              desc:"Advanced reasoning · complex tasks"},
      {id:"o3-mini",       label:"o3 mini",         desc:"Latest reasoning model · fast"},
    ],
    fallbackOrder: ["gpt-4o", "gpt-4o-mini", "o3-mini"]
  },
  {
    id:"anthropic", name:"Anthropic", logo:"A", color:"#da7756", colorBg:"rgba(218,119,86,0.12)", colorBdr:"rgba(218,119,86,0.3)",
    apiType:"anthropic", endpoint:"https://api.anthropic.com/v1/messages",
    keyHint:"Get API key at console.anthropic.com → API Keys", keyLink:"https://console.anthropic.com/",
    about:"Makers of Claude. Excellent at writing, analysis, and coding.",
    models:[
      {id:"claude-3-7-sonnet-20250219",   label:"Claude 3.7 Sonnet",  desc:"Latest · smartest · best for coding"},
      {id:"claude-3-5-sonnet-20241022",   label:"Claude 3.5 Sonnet",  desc:"Balanced · reliable · fast"},
      {id:"claude-3-5-haiku-20241022",  label:"Claude 3.5 Haiku", desc:"Fastest · most affordable"},
    ],
    fallbackOrder: ["claude-3-7-sonnet-20250219", "claude-3-5-sonnet-20241022", "claude-3-5-haiku-20241022"]
  },
  {
    id:"google", name:"Google Gemini", logo:"G", color:"#5b9cf5", colorBg:"rgba(91,156,245,0.12)", colorBdr:"rgba(91,156,245,0.3)",
    apiType:"gemini", endpoint:"",
    keyHint:"Free API key at aistudio.google.com → Get API Key", keyLink:"https://aistudio.google.com/",
    about:"Google's AI. Very generous free tier. Gemini Flash is fast and free.",
    models:[
      {id:"gemini-2.0-flash",   label:"Gemini 2.0 Flash",   desc:"Fastest · multimodal · free tier"},
      {id:"gemini-2.0-pro-exp-02-05", label:"Gemini 2.0 Pro", desc:"Most capable (experimental)"},
      {id:"gemini-1.5-flash",   label:"Gemini 1.5 Flash",   desc:"Stable · very fast · free tier"},
      {id:"gemini-2.0-flash-thinking-exp", label:"Gemini 2.0 Thinking", desc:"Experimental reasoning model"},
    ],
    fallbackOrder: ["gemini-2.0-flash", "gemini-1.5-flash"]
  },
  {
    id:"groq", name:"Groq", logo:"G", color:"#c9a03a", colorBg:"rgba(201,160,58,0.12)", colorBdr:"rgba(201,160,58,0.3)",
    apiType:"openai", endpoint:"https://api.groq.com/openai/v1/chat/completions",
    keyHint:"Free API key at console.groq.com → API Keys", keyLink:"https://console.groq.com/",
    about:"Extremely fast inference. Runs open source models like Llama and Mixtral.",
    models:[
      {id:"llama-3.3-70b-versatile",  label:"Llama 3.3 70B",   desc:"Best quality · smart & fast"},
      {id:"llama-3.1-8b-instant",     label:"Llama 3.1 8B",    desc:"Instant responses · great for quick tasks"},
      {id:"mixtral-8x7b-32768",       label:"Mixtral 8x7B",    desc:"Good balance · open weights"},
    ],
    fallbackOrder: ["llama-3.3-70b-versatile", "llama-3.1-8b-instant", "mixtral-8x7b-32768"]
  },
  {
    id:"deepseek", name:"DeepSeek", logo:"D", color:"#3ecfcf", colorBg:"rgba(62,207,207,0.12)", colorBdr:"rgba(62,207,207,0.3)",
    apiType:"openai", endpoint:"https://api.deepseek.com/v1/chat/completions",
    keyHint:"Get API key at platform.deepseek.com → API Keys", keyLink:"https://platform.deepseek.com/",
    about:"High performance models at a fraction of the cost. Excellent for coding.",
    models:[
      {id:"deepseek-chat",      label:"DeepSeek V3",      desc:"Best everyday model · very affordable"},
      {id:"deepseek-reasoner",  label:"DeepSeek R1",      desc:"Advanced reasoning · matches o1"},
    ],
    fallbackOrder: ["deepseek-chat", "deepseek-reasoner"]
  },
  {
    id:"universal", name:"Universal AI", logo:"U", color:"#999", colorBg:"rgba(153,153,153,0.12)", colorBdr:"rgba(153,153,153,0.3)",
    apiType:"openai", endpoint:"",
    keyHint:"Works with any OpenAI-compatible API. Paste the key and we'll ask for the URL if needed.", keyLink:"",
    about:"Connect to any AI provider in the world that uses the standard OpenAI format.",
    models:[
      {id:"gpt-4o", label:"Standard Model", desc:"The default model ID for this provider"},
    ],
  },
  {
    id:"ollama", name:"Ollama (Local)", logo:"◎", color:"#999", colorBg:"rgba(153,153,153,0.12)", colorBdr:"rgba(153,153,153,0.3)",
    apiType:"openai", endpoint:"http://localhost:11434/v1/chat/completions",
    keyHint:"No API key needed. Install Ollama and run: ollama pull llama3", keyLink:"https://ollama.ai/",
    about:"Run AI locally on your machine. Private, free, and no internet needed.",
    models:[
      {id:"llama3",         label:"Llama 3",       desc:"Meta's model · good all-rounder"},
      {id:"mistral",        label:"Mistral 7B",    desc:"Fast · good for coding"},
      {id:"deepseek-r1",    label:"DeepSeek R1",   desc:"Reasoning model · local"},
    ],
  },
];

const gid  = () => Math.random().toString(36).substr(2,9);
const tStr = iso => new Date(iso).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"});
const chatLabel = msgs => {
  const f=msgs.find(m=>m.type==="user");
  return f ? f.content.slice(0,44)+(f.content.length>44?"…":"") : "New chat";
};

// ── API calls ─────────────────────────────────────────────────────────────
const guessProvider = (key: string) => {
  if (key.startsWith("sk-ant-")) return PROVIDERS_CATALOGUE.find(p => p.id === "anthropic");
  if (key.startsWith("sk-")) return PROVIDERS_CATALOGUE.find(p => p.id === "openai");
  if (key.startsWith("gsk_")) return PROVIDERS_CATALOGUE.find(p => p.id === "groq");
  if (key.length === 39 && /^[a-zA-Z0-9_-]+$/.test(key)) return PROVIDERS_CATALOGUE.find(p => p.id === "google");
  if (key.startsWith("ds-")) return PROVIDERS_CATALOGUE.find(p => p.id === "deepseek");
  return null;
};

const getSystemKey = (apiType, providerId) => {
  if (apiType === "gemini") return import.meta.env.VITE_GEMINI_API_KEY;
  if (apiType === "anthropic") return import.meta.env.VITE_ANTHROPIC_API_KEY;
  if (providerId === "openai") return import.meta.env.VITE_OPENAI_API_KEY;
  if (providerId === "groq") return import.meta.env.VITE_GROQ_API_KEY;
  if (providerId === "deepseek") return import.meta.env.VITE_DEEPSEEK_API_KEY;
  return null;
};

async function callAI(ai, history, curMsg, mentions, replyTxt, isPhase2, otherResp, onChunk, signal) {
  const sys = buildSys(ai.name, mentions, ai.id, isPhase2, otherResp);
  const content = (replyTxt?`[Replying to: "${replyTxt.slice(0,80)}"]\n\n`:"")+curMsg;
  const apiKey = ai.apiKey || getSystemKey(ai.apiType, ai.providerId);
  
  const provider = PROVIDERS_CATALOGUE.find(p => p.id === ai.providerId);
  const modelsToTry = provider?.fallbackOrder ? [...provider.fallbackOrder] : [ai.model];
  if (!modelsToTry.includes(ai.model)) modelsToTry.unshift(ai.model);

  let lastErr = null;

  for (const modelId of modelsToTry) {
    try {
      if (ai.apiType==="anthropic") {
        if (!apiKey) throw new Error("Anthropic API key is missing.");
        const msgs=buildAnthHist(history,ai.id); msgs.push({role:"user",content});
        
        const r = await fetch("/api/proxy", {
          method: "POST",
          signal,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            url: "https://api.anthropic.com/v1/messages",
            method: "POST",
            headers: {
              "x-api-key": apiKey,
              "anthropic-version": "2023-06-01",
              "Content-Type": "application/json"
            },
            body: {
              model: modelId,
              max_tokens: 1024,
              system: sys,
              messages: msgs,
              stream: true
            }
          })
        });

        if(!r.ok) {
          const err = await eMsg(r);
          if (r.status === 429 || r.status === 402 || r.status === 400) {
            console.warn(`Model ${modelId} failed (${r.status}). Trying fallback...`);
            lastErr = err; continue;
          }
          throw new Error(err);
        }
        
        const reader = r.body.getReader();
        const decoder = new TextDecoder();
        let fullText = "";
        let buffer = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";
          for (const line of lines) {
            if (line.startsWith("data: ")) {
              try {
                const data = JSON.parse(line.slice(6));
                if (data.type === "content_block_delta" && data.delta?.text) {
                  fullText += data.delta.text;
                  onChunk?.(fullText);
                }
              } catch (e) {}
            }
          }
        }
        return fullText;
      }
      
      if (ai.apiType==="gemini") {
        if (!apiKey) throw new Error("Gemini API key is missing.");
        const genAI = new GoogleGenAI({ apiKey });
        const contents = buildGemHist(history, ai.id);
        contents.push({ role: "user", parts: [{ text: content }] });
        
        try {
          const response = await genAI.models.generateContentStream({
            model: modelId,
            contents,
            config: { systemInstruction: sys }
          });
          
          let fullText = "";
          for await (const chunk of response) {
            const text = chunk.text;
            if (text) {
              fullText += text;
              onChunk?.(fullText);
            }
          }
          return fullText;
        } catch (e: any) {
          if (e.message?.includes("429") || e.message?.includes("RESOURCE_EXHAUSTED")) {
            console.warn(`Model ${modelId} failed (Rate Limit). Trying fallback...`);
            lastErr = e.message; continue;
          }
          throw e;
        }
      }

      if (!apiKey && ai.providerId !== "ollama") throw new Error("API key is missing.");

      const msgs=[{role:"system",content:sys},...buildOAIHist(history,ai.id),{role:"user",content}];
      
      const r = await fetch("/api/proxy", {
        method: "POST",
        signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: ai.endpoint,
          method: "POST",
          headers: apiKey ? {
            "Authorization": `Bearer ${apiKey}`,
            "Content-Type": "application/json"
          } : { "Content-Type": "application/json" },
          body: {
            model: modelId,
            max_tokens: 1024,
            messages: msgs,
            stream: true
          }
        })
      });

      if(!r.ok) {
        const err = await eMsg(r);
        // Only retry on rate limits or quota issues
        if (r.status === 429 || r.status === 402) {
          console.warn(`Model ${modelId} failed (${r.status}). Trying fallback...`);
          lastErr = err; continue;
        }
        throw new Error(err);
      }
      
      const reader = r.body.getReader();
      const decoder = new TextDecoder();
      let fullText = "";
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
          const cleanLine = line.trim();
          if (!cleanLine || cleanLine === "data: [DONE]") continue;
          if (cleanLine.startsWith("data: ")) {
            try {
              const data = JSON.parse(cleanLine.slice(6));
              const content = data.choices?.[0]?.delta?.content;
              if (content) {
                fullText += content;
                onChunk?.(fullText);
              }
            } catch (e) {}
          }
        }
      }
      return fullText;
    } catch (e: any) {
      if (e.name === 'AbortError') throw e;
      console.error(`Error with model ${modelId}:`, e);
      lastErr = e.message || String(e);
      if (modelId === modelsToTry[modelsToTry.length - 1]) throw new Error(lastErr);
    }
  }
  throw new Error(lastErr || "All models failed");
}

async function eMsg(r){try{const d=await r.json();return d.error?.message||`HTTP ${r.status}`;}catch{return `HTTP ${r.status}`;}}
function buildSys(nm,mentions,aiId,isPhase2,otherResp){
  let s=`You are ${nm} in AGENTSWORM, a multi-AI group conference.
- Be helpful, direct, and concise.
- You are participating in a real-time discussion with other AIs.
- If you were @mentioned, address the user directly.
- If others were @mentioned, you can still contribute but keep it very brief.`;
  
  if(isPhase2){
    s+=`\n\nPHASE 2: Other AIs have already responded. 
- Review their answers below.
- ONLY respond if you can:
  a) Correct a factual error.
  b) Add a crucial missing piece of information.
  c) Provide a significantly different and valuable perspective.
- Keep it to 1-3 sentences max.
- If you have nothing important to add, reply EXACTLY with the word: SKIP`;
    if(otherResp) s+=`\n\nOther responses:\n${otherResp}`;
  }
  return s;
}
function buildTurns(h){const t=[];let c=null;for(const m of h){if(m.type==="user"){if(c)t.push(c);c={u:m.content,gid:m.groupId,res:[]};}if(c&&(m.type==="ai"||m.type==="ai_followup")&&m.groupId===c.gid)c.res.push(m);}if(c)t.push(c);return t;}
function buildAnthHist(h,id){return buildTurns(h).flatMap(t=>{const ctx=t.res.filter(x=>x.aiId!==id).map(x=>`${x.aiName}: ${x.content}`).join(" | ");const my=t.res.find(x=>x.aiId===id);return my?[{role:"user",content:ctx?t.u+"\n[Others: "+ctx+"]":t.u},{role:"assistant",content:my.content}]:[];});}
function buildGemHist(h,id){return buildTurns(h).flatMap(t=>{const ctx=t.res.filter(x=>x.aiId!==id).map(x=>`${x.aiName}: ${x.content}`).join(" | ");const my=t.res.find(x=>x.aiId===id);return my?[{role:"user",parts:[{text:ctx?t.u+"\n[Others: "+ctx+"]":t.u}]},{role:"model",parts:[{text:my.content}]}]:[];});}
function buildOAIHist(h,id){return buildTurns(h).flatMap(t=>{const ctx=t.res.filter(x=>x.aiId!==id).map(x=>`${x.aiName}: ${x.content}`).join(" | ");const my=t.res.find(x=>x.aiId===id);return my?[{role:"user",content:ctx?t.u+"\n[Others: "+ctx+"]":t.u},{role:"assistant",content:my.content}]:[];});}

function Av({ai,size=28}){
  const p=ai?pal(ai.colorIdx||0):PALETTES[0];
  return <div style={{width:size,height:size,borderRadius:"50%",background:p.bg,border:`1px solid ${p.bdr}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:size*.38,fontWeight:"600",color:p.fg,flexShrink:0}}>{ai?.name?.[0]?.toUpperCase()||"?"}</div>;
}
function Mentions({text,ais}){
  const sortedAIs = [...ais].sort((a,b) => b.name.length - a.name.length);
  const parts = [];
  let lastIdx = 0;
  const regex = /@(\w+)/g; // Simple regex for initial split, but we'll refine it
  
  // Actually, a more robust way to handle names with spaces is to look for @ followed by any name in our list
  // We'll use a manual scan for better control over names with spaces
  let i = 0;
  while (i < text.length) {
    if (text[i] === '@') {
      let found = false;
      for (const a of sortedAIs) {
        const namePart = text.slice(i + 1, i + 1 + a.name.length);
        if (namePart.toLowerCase() === a.name.toLowerCase()) {
          if (i > lastIdx) parts.push(text.slice(lastIdx, i));
          const pl = pal(a.colorIdx || 0);
          parts.push(<span key={i} className="chip" style={{background:pl.bg,color:pl.fg}}>@{a.name}</span>);
          i += 1 + a.name.length;
          lastIdx = i;
          found = true;
          break;
        }
      }
      if (!found) i++;
    } else {
      i++;
    }
  }
  if (lastIdx < text.length) parts.push(text.slice(lastIdx));
  
  return <>{parts.map((p, idx) => typeof p === 'string' ? <span key={idx}>{p}</span> : p)}</>;
}

// ── AUTH ──────────────────────────────────────────────────────────────────
function AuthScreen({onLogin}){
  const[mode,setMode]=useState("login");
  const[name,setName]=useState("");
  const[email,setEmail]=useState("");
  const[pw,setPw]=useState("");
  const[err,setErr]=useState("");
  const[busy,setBusy]=useState(false);

  const submit=async()=>{
    setErr("");if(busy)return;
    if(!email.trim()||!pw.trim()){setErr("Email and password required.");return;}
    if(mode==="register"&&!name.trim()){setErr("Name required.");return;}
    setBusy(true);
    try{
      if(mode==="register"){
        const cred = await createUserWithEmailAndPassword(auth, email.trim(), pw);
        await updateProfile(cred.user, { displayName: name.trim() });
        const u = { id: cred.user.uid, name: name.trim(), email: cred.user.email, joinedAt: new Date().toISOString(), role: 'user' };
        await setDoc(doc(db, "users", u.id), u);
        onLogin(u);
      }else{
        const cred = await signInWithEmailAndPassword(auth, email.trim(), pw);
        const uDoc = await getDoc(doc(db, "users", cred.user.uid));
        onLogin(uDoc.exists() ? uDoc.data() : { id: cred.user.uid, name: cred.user.displayName, email: cred.user.email });
      }
    }catch(e: any){
      console.error("Auth Error:", e);
      if (e.code === 'auth/email-already-in-use') setErr("This email is already registered. Try signing in.");
      else if (e.code === 'auth/weak-password') setErr("Password is too weak. Use at least 6 characters.");
      else if (e.code === 'auth/invalid-email') setErr("Invalid email address format.");
      else if (e.code === 'auth/operation-not-allowed') setErr("Email/Password login is not enabled in Firebase Console.");
      else if (e.code === 'auth/network-request-failed') setErr("Network error. Check your internet connection.");
      else setErr(e.message || "Authentication failed.");
    }
    setBusy(false);
  };

  const loginWithGoogle = async () => {
    setErr("");
    if (busy) return;
    setBusy(true);
    try {
      const provider = new GoogleAuthProvider();
      const cred = await signInWithPopup(auth, provider);
      const uDoc = await getDoc(doc(db, "users", cred.user.uid));
      if (!uDoc.exists()) {
        const u = { 
          id: cred.user.uid, 
          name: cred.user.displayName || cred.user.email?.split("@")[0] || "User", 
          email: cred.user.email, 
          joinedAt: new Date().toISOString(), 
          role: 'user' 
        };
        await setDoc(doc(db, "users", u.id), u);
        onLogin(u);
      } else {
        onLogin(uDoc.data());
      }
    } catch (e: any) {
      console.error("Google Auth Error:", e);
      if (e.code === 'auth/popup-blocked') setErr("Popup blocked! Please allow popups for this site.");
      else if (e.code === 'auth/unauthorized-domain') setErr("This domain is not authorized in Firebase. Add 'agentsworm.netlify.app' to Authorized Domains.");
      else setErr(e.message || "Google sign-in failed.");
    }
    setBusy(false);
  };

  return <div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",padding:"1.5rem",background:C.mainBg,fontFamily:"'Inter',sans-serif"}}>
    <div style={{width:"100%",maxWidth:"400px"}}>
      <div style={{textAlign:"center",marginBottom:"2.5rem"}}>
        <div style={{display:"inline-flex",alignItems:"center",justifyContent:"center",width:"64px",height:"64px",borderRadius:"20px",background:C.accBg,border:`1px solid ${C.accBdr}`,marginBottom:"20px",color:C.acc}}>
          <Sparkles size={32}/>
        </div>
        <div style={{fontSize:"36px",fontWeight:"700",color:C.txt,letterSpacing:"-.03em",marginBottom:"8px"}}>AgentSworm</div>
        <div style={{fontSize:"15px",color:C.txt2,lineHeight:"1.5",maxWidth:"300px",margin:"0 auto"}}>One room. Every AI. All at once.</div>
      </div>
      
      <div style={{background:C.surf,border:`1px solid ${C.bdr2}`,borderRadius:"24px",padding:"2rem",display:"flex",flexDirection:"column",gap:"16px",boxShadow:"0 20px 50px rgba(0,0,0,0.3)"}}>
        <div style={{display:"flex",gap:"4px",background:C.surf2,padding:"4px",borderRadius:"12px",marginBottom:"8px"}}>
          {["login","register"].map(m=><button key={m} onClick={()=>{setMode(m);setErr("");}}
            style={{flex:1,padding:"10px",fontSize:"14px",fontWeight:"600",cursor:"pointer",border:"none",borderRadius:"10px",fontFamily:"'Inter',sans-serif",transition:"all .2s",background:mode===m?C.acc:"transparent",color:mode===m?"#fff":C.txt3}}>
            {m==="login"?"Sign in":"Register"}
          </button>)}
        </div>

        <div style={{display:"flex",flexDirection:"column",gap:"12px"}}>
          {mode==="register"&&<div style={{position:"relative"}}>
            <span style={{position:"absolute",left:"14px",top:"14px",color:C.txt3}}><User size={18}/></span>
            <input className="inp" value={name} onChange={e=>setName(e.target.value)} placeholder="Full name" autoFocus style={{paddingLeft:"44px"}} onKeyDown={e=>e.key==="Enter"&&submit()}/>
          </div>}
          <div style={{position:"relative"}}>
            <span style={{position:"absolute",left:"14px",top:"14px",color:C.txt3}}><MessageSquare size={18}/></span>
            <input className="inp" value={email} onChange={e=>setEmail(e.target.value)} placeholder="Email address" type="email" autoFocus={mode==="login"} style={{paddingLeft:"44px"}} onKeyDown={e=>e.key==="Enter"&&submit()}/>
          </div>
          <div style={{position:"relative"}}>
            <span style={{position:"absolute",left:"14px",top:"14px",color:C.txt3}}><Settings size={18}/></span>
            <input className="inp" value={pw} onChange={e=>setPw(e.target.value)} placeholder="Password" type="password" style={{paddingLeft:"44px"}} onKeyDown={e=>e.key==="Enter"&&submit()}/>
          </div>
        </div>

        {err&&<div style={{fontSize:"13px",color:"#f6465d",padding:"12px",background:"rgba(246,70,93,.08)",borderRadius:"12px",lineHeight:"1.5",display:"flex",alignItems:"flex-start",gap:"10px"}}>
          <AlertCircle size={16} style={{flexShrink:0,marginTop:"2px"}}/> {err}
        </div>}

        <button className="btn btn-acc" onClick={submit} disabled={busy} style={{width:"100%",padding:"14px",fontSize:"15px",fontWeight:"600",marginTop:"4px",display:"flex",alignItems:"center",justifyContent:"center",gap:"10px"}}>
          {busy?"…":<>{mode==="login"?"Sign in":"Create account"} <ArrowRight size={18}/></>}
        </button>
        
        <div style={{display:"flex",alignItems:"center",gap:"12px",margin:"10px 0"}}>
          <div style={{flex:1,height:"1px",background:C.bdr}}/>
          <div style={{fontSize:"12px",color:C.txt3,fontWeight:"600"}}>OR</div>
          <div style={{flex:1,height:"1px",background:C.bdr}}/>
        </div>

        <button className="btn" onClick={loginWithGoogle} disabled={busy} 
          style={{width:"100%",padding:"12px",fontSize:"14px",fontWeight:"500",display:"flex",alignItems:"center",justifyContent:"center",gap:"10px",background:C.surf2,border:`1px solid ${C.bdr2}`,borderRadius:"12px"}}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
          </svg>
          Continue with Google
        </button>
      </div>
      <div style={{textAlign:"center",marginTop:"2rem",fontSize:"12px",color:C.txt3}}>
        By continuing, you agree to our Terms of Service and Privacy Policy.
      </div>
    </div>
  </div>;
}

// ── ADD AI SETTINGS PANEL ─────────────────────────────────────────────────
function SettingsPanel({ais, onAdd, onRemove, onClose, theme, setTheme}) {
  const[step,setStep]=useState("grid"); // grid | configure
  const[selected,setSelected]=useState(null); // provider from catalogue
  const[apiKey,setApiKey]=useState("");
  const[model,setModel]=useState("");
  const[err,setErr]=useState("");

  const openProvider=prov=>{
    setSelected(prov);
    setApiKey("");
    setModel(prov.models[0]?.id||"");
    setErr("");
    setStep("configure");
  };

  const [confirmDelete, setConfirmDelete] = useState<string|null>(null);

  const addAI=()=>{
    setErr("");
    const hasSystemKey = !!getSystemKey(selected.apiType, selected.id);
    if(!apiKey.trim() && selected.id !== "ollama" && !hasSystemKey){
      setErr("API key is required.");
      return;
    }
    if(!model){setErr("Please select a model.");return;}
    const modelLabel=selected.models.find(m=>m.id===model)?.label||model;
    const ai={
      id:gid(),
      userId: auth.currentUser?.uid,
      name:`${selected.name} · ${modelLabel}`,
      apiType:selected.apiType,
      endpoint:selected.endpoint,
      model,
      apiKey:apiKey.trim(),
      colorIdx:ais.length,
      providerId:selected.id,
    };
    onAdd(ai);
    setStep("grid");
    setSelected(null);
    setApiKey("");
    setModel("");
  };

  return <div style={{height:"100%",display:"flex",flexDirection:"column"}}>
    <div style={{padding:"14px 16px",borderBottom:`1px solid ${C.bdr}`,display:"flex",alignItems:"center",gap:"10px",flexShrink:0}}>
      {step==="configure"&&<button className="btn btn-ghost" onClick={()=>setStep("grid")}
        style={{fontSize:"12px",padding:"4px 10px",display:"flex",alignItems:"center",gap:"6px"}}><ChevronLeft size={14}/> Back</button>}
      <div style={{flex:1,fontSize:"13px",fontWeight:"600",color:C.txt}}>
        {step==="grid"?"Connect an AI":selected?.name}
      </div>
      <button className="btn btn-ghost" onClick={onClose} style={{fontSize:"12px",padding:"4px 9px"}}><X size={16}/></button>
    </div>

    <div className="sc" style={{flex:1,overflowY:"auto",padding:"14px"}}>
      {step==="grid"&&<>
        <div style={{marginBottom:"20px"}}>
          <div style={{fontSize:"11px",color:C.txt3,fontWeight:"500",letterSpacing:".06em",textTransform:"uppercase",marginBottom:"8px",display:"flex",alignItems:"center",gap:"6px"}}><Sparkles size={12}/> Appearance</div>
          <div style={{display:"flex", gap:"8px", flexWrap:"wrap"}}>
            <button onClick={() => setTheme("dark")} style={{flex:1, minWidth:"80px", padding:"10px", borderRadius:C.rSm, border:`1px solid ${theme==="dark"?C.acc:C.bdr}`, background:theme==="dark"?C.accBg:C.surf, color:theme==="dark"?C.acc:C.txt2, fontSize:"12px", cursor:"pointer", transition:"all .15s"}}>
              Dark
            </button>
            <button onClick={() => setTheme("midnight")} style={{flex:1, minWidth:"80px", padding:"10px", borderRadius:C.rSm, border:`1px solid ${theme==="midnight"?C.acc:C.bdr}`, background:theme==="midnight"?C.accBg:C.surf, color:theme==="midnight"?C.acc:C.txt2, fontSize:"12px", cursor:"pointer", transition:"all .15s"}}>
              Midnight
            </button>
            <button onClick={() => setTheme("forest")} style={{flex:1, minWidth:"80px", padding:"10px", borderRadius:C.rSm, border:`1px solid ${theme==="forest"?C.acc:C.bdr}`, background:theme==="forest"?C.accBg:C.surf, color:theme==="forest"?C.acc:C.txt2, fontSize:"12px", cursor:"pointer", transition:"all .15s"}}>
              Forest
            </button>
            <button onClick={() => setTheme("cyberpunk")} style={{flex:1, minWidth:"80px", padding:"10px", borderRadius:C.rSm, border:`1px solid ${theme==="cyberpunk"?C.acc:C.bdr}`, background:theme==="cyberpunk"?C.accBg:C.surf, color:theme==="cyberpunk"?C.acc:C.txt2, fontSize:"12px", cursor:"pointer", transition:"all .15s"}}>
              Cyberpunk
            </button>
            <button onClick={() => setTheme("sunset")} style={{flex:1, minWidth:"80px", padding:"10px", borderRadius:C.rSm, border:`1px solid ${theme==="sunset"?C.acc:C.bdr}`, background:theme==="sunset"?C.accBg:C.surf, color:theme==="sunset"?C.acc:C.txt2, fontSize:"12px", cursor:"pointer", transition:"all .15s"}}>
              Sunset
            </button>
            <button onClick={() => setTheme("ocean")} style={{flex:1, minWidth:"80px", padding:"10px", borderRadius:C.rSm, border:`1px solid ${theme==="ocean"?C.acc:C.bdr}`, background:theme==="ocean"?C.accBg:C.surf, color:theme==="ocean"?C.acc:C.txt2, fontSize:"12px", cursor:"pointer", transition:"all .15s"}}>
              Ocean Deep
            </button>
          </div>
        </div>

        <div style={{marginBottom:"20px", padding:"16px", background:C.accBg, border:`1px solid ${C.accBdr}`, borderRadius:C.rMd}}>
          <div style={{fontSize:"11px",color:C.acc,fontWeight:"600",letterSpacing:".06em",textTransform:"uppercase",marginBottom:"10px",display:"flex",alignItems:"center",gap:"6px"}}><Sparkles size={12}/> Smart Connect</div>
          <div style={{fontSize:"12px", color:C.txt2, marginBottom:"12px", lineHeight:"1.5"}}>
            Paste any AI API key below. We'll automatically detect the provider or set up a universal connection.
          </div>
          <div style={{display:"flex", flexDirection:"column", gap:"8px"}}>
            <input 
              className="inp" 
              placeholder="Paste API Key (sk-..., gsk_..., etc.)" 
              value={apiKey}
              onChange={(e) => {
                const val = e.target.value;
                setApiKey(val);
                const guessed = guessProvider(val);
                if (guessed) {
                  const ai = {
                    id: gid(),
                    userId: auth.currentUser?.uid,
                    name: `${guessed.name} (Smart)`,
                    apiType: guessed.apiType,
                    endpoint: guessed.endpoint,
                    model: guessed.models[0].id,
                    apiKey: val.trim(),
                    colorIdx: ais.length,
                    providerId: guessed.id,
                  };
                  onAdd(ai);
                  setApiKey("");
                  setStep("grid");
                }
              }}
              style={{flex:1}}
            />
            {apiKey.length > 10 && !guessProvider(apiKey) && (
              <div style={{marginTop:"4px", padding:"10px", background:C.surf, borderRadius:C.rSm, border:`1px solid ${C.bdr2}`}}>
                <div style={{fontSize:"11px", color:C.txt3, marginBottom:"6px"}}>Unrecognized key. Use as Universal AI?</div>
                <div style={{display:"flex", gap:"6px"}}>
                  <input 
                    className="inp" 
                    placeholder="Base URL (e.g. https://api.example.com/v1)" 
                    id="universal-url"
                    style={{fontSize:"11px", padding:"6px 10px"}}
                  />
                  <button className="btn btn-acc" style={{fontSize:"11px", padding:"6px 10px"}} onClick={() => {
                    const url = (document.getElementById("universal-url") as HTMLInputElement).value;
                    const ai = {
                      id: gid(),
                      userId: auth.currentUser?.uid,
                      name: "Universal AI",
                      apiType: "openai",
                      endpoint: url.trim() + (url.endsWith("/") ? "chat/completions" : "/chat/completions"),
                      model: "gpt-4o", // Default model ID for generic APIs
                      apiKey: apiKey.trim(),
                      colorIdx: ais.length,
                      providerId: "universal",
                    };
                    onAdd(ai);
                    setApiKey("");
                    setStep("grid");
                  }}>Connect</button>
                </div>
              </div>
            )}
          </div>
        </div>

        {ais.length>0&&<>
          <div style={{fontSize:"11px",color:C.txt3,fontWeight:"500",letterSpacing:".06em",textTransform:"uppercase",marginBottom:"8px",display:"flex",alignItems:"center",gap:"6px"}}><Bot size={12}/> Connected ({ais.length})</div>
          {ais.map((ai,i)=>{
            const p=pal(ai.colorIdx||i);
            const prov=PROVIDERS_CATALOGUE.find(x=>x.id===ai.providerId);
            return <div key={ai.id} style={{display:"flex",alignItems:"center",gap:"10px",padding:"10px 12px",
              background:p.bg,border:`1px solid ${p.bdr}`,borderRadius:C.rMd,marginBottom:"7px"}}>
              <Av ai={ai} size={26}/>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:"13px",fontWeight:"500",color:C.txt,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{ai.name}</div>
                <div style={{fontSize:"11px",color:C.txt3}}>{prov?.name||ai.apiType}</div>
              </div>
              <div style={{display:"flex",alignItems:"center",gap:"8px"}}>
                {confirmDelete === ai.id ? (
                  <>
                    <button onClick={(e) => { e.stopPropagation(); onRemove(ai.id); }} style={{background:"#f6465d",color:"#fff",border:"none",borderRadius:"6px",padding:"4px 8px",fontSize:"11px",fontWeight:"600",cursor:"pointer"}}>Confirm</button>
                    <button onClick={(e) => { e.stopPropagation(); setConfirmDelete(null); }} style={{background:"transparent",color:C.txt3,border:"none",borderRadius:"6px",padding:"4px 8px",fontSize:"11px",cursor:"pointer"}}>Cancel</button>
                  </>
                ) : (
                  <button className="btn btn-ghost" onClick={(e) => { e.stopPropagation(); setConfirmDelete(ai.id); }}
                    style={{fontSize:"10px",padding:"3px 8px",color:C.txt3,flexShrink:0}}><Trash2 size={14}/></button>
                )}
              </div>
            </div>;
          })}
          <div style={{borderTop:`1px solid ${C.bdr}`,margin:"14px 0"}}/>
        </>}

        <div style={{fontSize:"11px",color:C.txt3,fontWeight:"500",letterSpacing:".06em",textTransform:"uppercase",marginBottom:"10px",display:"flex",alignItems:"center",gap:"6px"}}><Plus size={12}/> Choose a provider</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"8px"}}>
          {PROVIDERS_CATALOGUE.map(prov=>{
            const alreadyAdded=ais.filter(a=>a.providerId===prov.id).length;
            return <div key={prov.id} className="prov-card" onClick={()=>openProvider(prov)}
              style={{background:prov.colorBg,borderColor:prov.colorBdr}}>
              <div style={{display:"flex",alignItems:"center",gap:"8px",marginBottom:"7px"}}>
                <div style={{width:32,height:32,borderRadius:"8px",background:prov.colorBg,
                  border:`1px solid ${prov.colorBdr}`,display:"flex",alignItems:"center",
                  justifyContent:"center",fontSize:"15px",fontWeight:"700",color:prov.color,flexShrink:0}}>
                  {prov.logo}
                </div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:"13px",fontWeight:"600",color:C.txt,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{prov.name}</div>
                  {alreadyAdded>0&&<div style={{fontSize:"10px",color:prov.color}}>{alreadyAdded} connected</div>}
                </div>
              </div>
              <div style={{fontSize:"11px",color:C.txt3,lineHeight:"1.4"}}>{prov.about}</div>
            </div>;
          })}
        </div>
      </>}

      {step==="configure"&&selected&&<>
        <div style={{display:"flex",alignItems:"center",gap:"12px",padding:"14px",
          background:selected.colorBg,border:`1px solid ${selected.colorBdr}`,borderRadius:C.rMd,marginBottom:"16px"}}>
          <div style={{width:40,height:40,borderRadius:"10px",background:selected.colorBg,
            border:`1px solid ${selected.colorBdr}`,display:"flex",alignItems:"center",
            justifyContent:"center",fontSize:"20px",fontWeight:"700",color:selected.color,flexShrink:0}}>
            {selected.logo}
          </div>
          <div>
            <div style={{fontSize:"14px",fontWeight:"600",color:C.txt,marginBottom:"3px"}}>{selected.name}</div>
            <div style={{fontSize:"12px",color:C.txt3,lineHeight:"1.4"}}>{selected.about}</div>
          </div>
        </div>

        <div style={{marginBottom:"16px"}}>
          <div style={{fontSize:"12px",fontWeight:"600",color:C.txt,marginBottom:"8px",
            display:"flex",alignItems:"center",gap:"6px"}}>
            <span style={{width:20,height:20,borderRadius:"50%",background:C.acc,display:"flex",
              alignItems:"center",justifyContent:"center",fontSize:"11px",fontWeight:"700",color:"#fff",flexShrink:0}}>1</span>
            {selected.id==="ollama"?"No API key needed":"Enter your API key"}
          </div>
          {selected.id!=="ollama"?<>
            <div style={{position:"relative"}}>
              <input className="inp" value={apiKey} onChange={e=>setApiKey(e.target.value)}
                placeholder={getSystemKey(selected.apiType, selected.id) ? "Using system key (optional to override)" : "Paste your API key here…"} 
                type="password"
                style={{marginBottom:"8px", paddingRight: getSystemKey(selected.apiType, selected.id) ? "100px" : "12px"}}/>
              {getSystemKey(selected.apiType, selected.id) && (
                <div style={{position:"absolute", right:"10px", top:"11px", fontSize:"10px", background:C.accBg, color:C.acc, padding:"2px 6px", borderRadius:"4px", fontWeight:"600", border:`1px solid ${C.accBdr}`}}>
                  SYSTEM KEY
                </div>
              )}
            </div>
            <div style={{fontSize:"12px",color:C.txt3,padding:"9px 12px",background:C.surf2,
              borderRadius:C.rSm,lineHeight:"1.5",display:"flex",alignItems:"flex-start",gap:"6px"}}>
              <span style={{color:selected.color,flexShrink:0}}>→</span>
              <span>{selected.keyHint}</span>
            </div>
          </>:<div style={{fontSize:"12px",color:C.txt3,padding:"9px 12px",background:C.surf2,
            borderRadius:C.rSm,lineHeight:"1.5"}}>
            {selected.keyHint}
          </div>}
        </div>

        <div style={{marginBottom:"16px"}}>
          <div style={{fontSize:"12px",fontWeight:"600",color:C.txt,marginBottom:"8px",
            display:"flex",alignItems:"center",gap:"6px"}}>
            <span style={{width:20,height:20,borderRadius:"50%",background:C.acc,display:"flex",
              alignItems:"center",justifyContent:"center",fontSize:"11px",fontWeight:"700",color:"#fff",flexShrink:0}}>2</span>
            Choose a model
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:"5px"}}>
            {selected.models.map(m=><button key={m.id} onClick={()=>setModel(m.id)}
              style={{display:"flex",alignItems:"center",gap:"10px",padding:"10px 12px",
                borderRadius:C.rSm,cursor:"pointer",border:`1px solid ${model===m.id?selected.colorBdr:C.bdr}`,
                background:model===m.id?selected.colorBg:"transparent",transition:"all .15s",
                fontFamily:"'Inter',sans-serif",textAlign:"left"}}>
              <div style={{width:14,height:14,borderRadius:"50%",border:`2px solid ${model===m.id?selected.color:C.txt3}`,
                display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                {model===m.id&&<div style={{width:6,height:6,borderRadius:"50%",background:selected.color}}/>}
              </div>
              <div style={{flex:1}}>
                <div style={{fontSize:"13px",fontWeight:"500",color:model===m.id?C.txt:C.txt2}}>{m.label}</div>
                <div style={{fontSize:"11px",color:C.txt3,marginTop:"1px"}}>{m.desc}</div>
              </div>
            </button>)}
          </div>
        </div>

        {err&&<div style={{fontSize:"12px",color:"#f6465d",padding:"9px 11px",background:"rgba(246,70,93,.1)",borderRadius:C.rSm,lineHeight:"1.4",marginBottom:"12px"}}>{err}</div>}

        <button className="btn btn-acc" onClick={addAI} style={{width:"100%",padding:"11px",fontSize:"14px",display:"flex",alignItems:"center",justifyContent:"center",gap:"8px"}}>
          Connect {selected.name} <ArrowRight size={16}/>
        </button>
      </>}
    </div>
  </div>;
}

// ── MAIN APP ──────────────────────────────────────────────────────────────
function AgentSwormApp(){
  const[ready,setReady]=useState(false);
  const[user,setUser]=useState(null);
  const[theme,setTheme]=useState(()=>{
    const t = localStorage.getItem("as-theme")||"dark";
    if (t !== "dark") document.body.className = `theme-${t}`;
    return t;
  });
  const[chats,setChats]=useState([]);
  const[activeId,setActiveId]=useState(null);
  const[search,setSearch]=useState("");
  const[input,setInput]=useState("");
  const[globalErr,setGlobalErr]=useState<string|null>(null);
  const[ais,setAis]=useState([]);
  const[enabledIds,setEnabledIds]=useState([]);
  const[loading,setLoading]=useState({});
  const[phase2,setPhase2]=useState(false);
  const[replyTo,setReplyTo]=useState(null);
  const[mentionQ,setMentionQ]=useState(null);
  const[showSettings,setShowSettings]=useState(false);
  const[sideOpen,setSideOpen]=useState(true);
  const controllers = useRef<Record<string, AbortController>>({});
  const bottomRef=useRef(null);
  const taRef=useRef(null);

  const activeChat=chats.find(c=>c.id===activeId);
  const isLoading=Object.values(loading).some(Boolean)||phase2;
  const enabledAIs=ais.filter(a=>enabledIds.includes(a.id));

  useEffect(() => {
    localStorage.setItem("as-theme", theme);
    document.body.className = theme === "dark" ? "" : `theme-${theme}`;
  }, [theme]);

  // Auth Listener
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (u) {
        const uDoc = await getDoc(doc(db, "users", u.uid));
        setUser(uDoc.exists() ? uDoc.data() : { id: u.uid, name: u.displayName, email: u.email });
      } else {
        setUser(null);
        setChats([]);
        setAis([]);
      }
      setReady(true);
    });
    return unsub;
  }, []);

  // Firestore Listeners
  useEffect(() => {
    if (!user) return;

    // Listen for Chats
    const chatsQ = query(collection(db, "chats"), where("userId", "==", user.id), orderBy("createdAt", "desc"));
    const unsubChats = onSnapshot(chatsQ, (snap) => {
      const data = snap.docs.map(d => d.data());
      setChats(data);
    }, (err) => handleFirestoreError(err, OperationType.LIST, "chats"));

    // Listen for AIs
    const aisQ = query(collection(db, "ais"), where("userId", "==", user.id));
    const unsubAIs = onSnapshot(aisQ, (snap) => {
      const data = snap.docs.map(d => d.data());
      setAis(data);
      // Auto-enable all AIs if none are enabled yet
      setEnabledIds(prev => prev.length === 0 ? data.map(a => a.id) : prev);
    }, (err) => handleFirestoreError(err, OperationType.LIST, "ais"));

    return () => { unsubChats(); unsubAIs(); };
  }, [user]);

  useEffect(()=>{bottomRef.current?.scrollIntoView({behavior:"smooth"});}, [activeChat?.messages]);

  const logout=()=>signOut(auth);

  const addAI=async ai=>{
    try {
      await setDoc(doc(db, "ais", ai.id), ai);
      setEnabledIds(p=>[...p,ai.id]);
    } catch(e) { handleFirestoreError(e, OperationType.WRITE, "ais"); }
  };

  const removeAI=async id=>{
    try {
      await deleteDoc(doc(db, "ais", id));
      setEnabledIds(p=>p.filter(x=>x!==id));
    } catch(e) { handleFirestoreError(e, OperationType.DELETE, "ais"); }
  };

  const toggleAI=(id,on)=>setEnabledIds(p=>on?[...p,id]:p.filter(x=>x!==id));

  const newChat=async()=>{
    const c={id:gid(),userId: user.id, createdAt:new Date().toISOString(),messages:[]};
    try {
      await setDoc(doc(db, "chats", c.id), c);
      setActiveId(c.id);setInput("");setReplyTo(null);
      setTimeout(()=>taRef.current?.focus(),80);
    } catch(e) { handleFirestoreError(e, OperationType.WRITE, "chats"); }
  };

  const [confirmClear, setConfirmClear] = useState(false);
  const [confirmDelChat, setConfirmDelChat] = useState<string|null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showScrollBtn, setShowScrollBtn] = useState(false);

  const onScroll = () => {
    if (!scrollRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    setShowScrollBtn(scrollHeight - scrollTop - clientHeight > 300);
  };

  const scrollToBottom = () => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  };

  useEffect(() => {
    if (!showScrollBtn) {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "auto" });
    }
  }, [activeChat?.messages]);

  const delChat = async (id) => {
    try {
      await deleteDoc(doc(db, "chats", id));
      if (activeId === id) setActiveId(null);
      setConfirmDelChat(null);
    } catch (e) { handleFirestoreError(e, OperationType.DELETE, "chats"); }
  };

  const clearChat = async () => {
    if (!activeChat) return;
    try {
      await setDoc(doc(db, "chats", activeChat.id), { ...activeChat, messages: [] });
      setConfirmClear(false);
    } catch (e) { handleFirestoreError(e, OperationType.UPDATE, "chats"); }
  };

  const stopAI = (aiId: string) => {
    if (controllers.current[aiId]) {
      controllers.current[aiId].abort();
      delete controllers.current[aiId];
      setLoading(prev => ({ ...prev, [aiId]: false }));
    }
  };

  const regenerate = async (msg) => {
    if (!activeChat || isLoading) return;
    const ai = ais.find(a => a.id === msg.aiId);
    if (!ai) return;

    const controller = new AbortController();
    controllers.current[ai.id] = controller;
    setLoading(prev => ({ ...prev, [ai.id]: true }));

    const userMsg = activeChat.messages.find(m => m.groupId === msg.groupId && m.type === "user");
    if (!userMsg) {
      setLoading(prev => ({ ...prev, [ai.id]: false }));
      delete controllers.current[ai.id];
      return;
    }

    const history = activeChat.messages.filter(m => {
      const mIdx = activeChat.messages.indexOf(m);
      const userIdx = activeChat.messages.indexOf(userMsg);
      return mIdx < userIdx;
    });

    try {
      const replyTxt = userMsg.replyToId ? activeChat.messages.find(m => m.id === userMsg.replyToId)?.content : null;
      
      let lastUpdate = 0;
      const resp = await callAI(ai, history, userMsg.content, userMsg.mentions, replyTxt, false, null, (chunk) => {
        const now = Date.now();
        if (now - lastUpdate > 500) { // Throttle Firestore updates to every 500ms
          lastUpdate = now;
          getDoc(doc(db, "chats", activeChat.id)).then(docSnap => {
            if (docSnap.exists()) {
              const chat = docSnap.data();
              const msgs = chat.messages.map(m => m.id === msg.id ? { ...m, content: chunk, loading: true } : m);
              setDoc(doc(db, "chats", activeChat.id), { ...chat, messages: msgs });
            }
          });
        }
      }, controller.signal);
      
      const currentChatDoc = await getDoc(doc(db, "chats", activeChat.id));
      if (currentChatDoc.exists()) {
        const currentChat = currentChatDoc.data();
        const updatedMessages = currentChat.messages.map(m => 
          m.id === msg.id ? { ...m, content: resp, error: null, loading: false, timestamp: new Date().toISOString() } : m
        );
        await setDoc(doc(db, "chats", activeChat.id), { ...currentChat, messages: updatedMessages });
      }
    } catch (e: any) {
      if (e.name === 'AbortError') return;
      const currentChatDoc = await getDoc(doc(db, "chats", activeChat.id));
      if (currentChatDoc.exists()) {
        const currentChat = currentChatDoc.data();
        const updatedMessages = currentChat.messages.map(m => 
          m.id === msg.id ? { ...m, content: null, error: e.message || String(e), loading: false } : m
        );
        await setDoc(doc(db, "chats", activeChat.id), { ...currentChat, messages: updatedMessages });
      }
    } finally {
      setLoading(prev => ({ ...prev, [ai.id]: false }));
      delete controllers.current[ai.id];
    }
  };

  const onInputChange=e=>{
    const v=e.target.value;setInput(v);
    const m=v.slice(0,e.target.selectionStart).match(/@(\w*)$/);
    setMentionQ(m?{q:m[1].toLowerCase(),start:e.target.selectionStart-m[0].length}:null);
  };
  const insertMention=nm=>{
    if(mentionQ===null)return;
    const after=input.slice(taRef.current?.selectionStart||input.length);
    setInput(input.slice(0,mentionQ.start)+"@"+nm+" "+after);
    setMentionQ(null);setTimeout(()=>taRef.current?.focus(),40);
  };
  const mentionList=mentionQ!==null?ais.filter(a=>a.name.toLowerCase().includes(mentionQ.q)):[];

  const send = async () => {
    if (!input.trim() || isLoading || enabledAIs.length === 0) return;
    const msg = input.trim(); setInput(""); setReplyTo(null); setMentionQ(null);
    let chat = activeChat;
    const chatId = chat ? chat.id : gid();
    const groupId = gid();

    // Improved mention detection for names with spaces
    const mentioned = [];
    const sortedAIs = [...ais].sort((a, b) => b.name.length - a.name.length);
    let searchTxt = msg.toLowerCase();
    for (const a of sortedAIs) {
      if (searchTxt.includes("@" + a.name.toLowerCase())) {
        mentioned.push(a.id);
        searchTxt = searchTxt.replace("@" + a.name.toLowerCase(), " ");
      }
    }

    const replyTxt = replyTo?.content || null;
    const userMsg = { id: gid(), type: "user", content: msg, timestamp: new Date().toISOString(), groupId, replyToId: replyTo?.id || null, mentions: mentioned };
    const placeholders = enabledAIs.map(ai => ({ id: gid(), type: "ai", aiId: ai.id, aiName: ai.name, content: null, error: null, loading: true, timestamp: new Date().toISOString(), groupId }));

    const newMessages = [...(chat?.messages || []), userMsg, ...placeholders];
    const updChat = chat ? { ...chat, messages: newMessages } : { id: chatId, userId: user.id, createdAt: new Date().toISOString(), messages: newMessages };

    try {
      await setDoc(doc(db, "chats", chatId), updChat);
      setActiveId(chatId);
    } catch (e: any) { 
      const errStr = e.message || String(e);
      setGlobalErr(`Failed to start chat: ${errStr}`);
      console.error("Initial write error", e);
      return; // Stop if initial write fails
    }

    const nl = {}; enabledAIs.forEach(a => nl[a.id] = true); setLoading(nl);
    const prevMsgs = (chat?.messages || []);
    const p1: Record<string, { content: string | null, error: string | null }> = {};

    // Use a transaction-like approach to avoid race conditions when multiple AIs update the same chat
    const updateChatMessage = async (aiId: string, content: string | null, error: string | null, loading: boolean = false) => {
      p1[aiId] = { content, error };
      try {
        await runTransaction(db, async (transaction) => {
          const chatDoc = await transaction.get(doc(db, "chats", chatId));
          if (!chatDoc.exists()) return;
          const currentChat = chatDoc.data();
          const updatedMessages = currentChat.messages.map(m =>
            m.groupId === groupId && m.type === "ai" && m.aiId === aiId
              ? { ...m, content, error, loading }
              : m
          );
          transaction.update(doc(db, "chats", chatId), { messages: updatedMessages });
        });
      } catch (e: any) { 
        console.error("Update error", e);
        // If it's a permission error, we should probably stop the AI call for this AI
        if (e.code === 'permission-denied') {
          throw e;
        }
      }
    };

    await Promise.allSettled(enabledAIs.map(async ai => {
      const controller = new AbortController();
      controllers.current[ai.id] = controller;

      try {
        let lastUpdate = 0;
        const resp = await callAI(ai, prevMsgs, msg, mentioned, replyTxt, false, null, async (chunk) => {
          const now = Date.now();
          if (now - lastUpdate > 1000) { // Throttle updates more aggressively
            lastUpdate = now;
            await updateChatMessage(ai.id, chunk, null, true);
          }
        }, controller.signal);
        await updateChatMessage(ai.id, resp, null, false);
      } catch (e: any) {
        if (e.name === 'AbortError') return;
        await updateChatMessage(ai.id, null, e.message || String(e), false);
      } finally {
        setLoading(prev => ({ ...prev, [ai.id]: false }));
        delete controllers.current[ai.id];
      }
    }));

    const p1Lines = Object.entries(p1).filter(([, v]) => v?.content).map(([id, v]) => `${ais.find(a => a.id === id)?.name || id}: ${v.content}`);
    if (p1Lines.length > 1) {
      setPhase2(true);
      try {
        await Promise.allSettled(enabledAIs.map(async ai => {
          if (!p1[ai.id]?.content) return;
          const others = p1Lines.filter(l => !l.startsWith(ai.name + ":")).join("\n\n");

          const controller = new AbortController();
          controllers.current[`p2_${ai.id}`] = controller;

          try {
            const resp = await callAI(ai, prevMsgs, msg, mentioned, replyTxt, true, others, undefined, controller.signal);
            if (resp && !resp.trim().toUpperCase().startsWith("SKIP")) {
              const fu = { id: gid(), type: "ai_followup", aiId: ai.id, aiName: ai.name, content: resp.replace(/^SKIP\s*/i, "").trim(), error: null, loading: false, timestamp: new Date().toISOString(), groupId };
              
              await runTransaction(db, async (transaction) => {
                const chatDoc = await transaction.get(doc(db, "chats", chatId));
                if (!chatDoc.exists()) return;
                const currentChat = chatDoc.data();
                if (!currentChat.messages.some(m => m.id === fu.id)) {
                  transaction.update(doc(db, "chats", chatId), { messages: [...currentChat.messages, fu] });
                }
              });
            }
          } catch (e) {
            if (e.name !== 'AbortError') console.error("Phase 2 error", e);
          } finally {
            delete controllers.current[`p2_${ai.id}`];
          }
        }));
      } finally {
        setPhase2(false);
      }
    }
  };

  if(!ready)return <div style={{background:C.mainBg,height:"100vh",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'Inter',sans-serif",color:C.txt3,fontSize:"13px"}}>Loading…</div>;
  if(!user)return <AuthScreen onLogin={setUser}/>;

  const filtered=chats.filter(c=>!search||chatLabel(c.messages).toLowerCase().includes(search.toLowerCase()));

  return (
    <>
      {globalErr && (
        <div style={{position:"fixed", top:"20px", left:"50%", transform:"translateX(-50%)", zIndex:1000, background:"#f6465d", color:"#fff", padding:"12px 20px", borderRadius:C.rMd, boxShadow:"0 10px 30px rgba(0,0,0,0.3)", display:"flex", alignItems:"center", gap:"12px", maxWidth:"90%", animation:"slideIn 0.3s ease"}}>
          <AlertCircle size={20} />
          <div style={{flex:1, fontSize:"13px", fontWeight:"500"}}>{globalErr}</div>
          <button onClick={() => setGlobalErr(null)} style={{background:"none", border:"none", color:"#fff", cursor:"pointer", padding:"4px", display:"flex", alignItems:"center"}}><X size={16}/></button>
        </div>
      )}
      <div style={{display:"flex",height:"100vh",background:C.mainBg,fontFamily:"'Inter',sans-serif",color:C.txt,overflow:"hidden"}}>
      <div className="sidebar" style={{width:sideOpen?255:0,flexShrink:0,background:C.sideBg,borderRight:sideOpen?`1px solid ${C.bdr}`:"none",display:"flex",flexDirection:"column",overflow:"hidden",opacity:sideOpen?1:0}}>
        <div style={{padding:"14px 12px 10px",flexShrink:0}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"14px"}}>
            <span style={{fontSize:"17px",fontWeight:"600",color:C.txt,letterSpacing:"-.02em",display:"flex",alignItems:"center",gap:"8px"}}><Sparkles size={20} color={C.acc}/> AgentSworm</span>
            <button className="btn btn-ghost" onClick={newChat} style={{fontSize:"12px",padding:"5px 11px",display:"flex",alignItems:"center",gap:"6px"}}><Plus size={14}/> New</button>
          </div>
          <div style={{position:"relative"}}>
            <span style={{position:"absolute",left:"10px",top:"50%",transform:"translateY(-50%)",color:C.txt3,fontSize:"14px",pointerEvents:"none"}}><Search size={14}/></span>
            <input className="inp" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search chats…" style={{paddingLeft:"30px",background:C.surf,fontSize:"12px"}}/>
          </div>
        </div>
        <div className="sc" style={{flex:1,overflowY:"auto",padding:"0 0 6px"}}>
          {filtered.length===0&&<div style={{padding:"2rem 16px",fontSize:"13px",color:C.txt3,textAlign:"center",lineHeight:"1.7"}}>{search?"No chats found.":"No chats yet.\nStart a new one."}</div>}
          {filtered.map(c=><div key={c.id} className={`chat-row${c.id===activeId?" active":""}`} onClick={()=>setActiveId(c.id)} style={{position:"relative"}}>
            <div style={{flex:1, minWidth:0}}>
              <div style={{fontSize:"13px",fontWeight:"500",color:c.id===activeId?C.txt:C.txt2,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",marginBottom:"3px",display:"flex",alignItems:"center",gap:"8px"}}><MessageSquare size={14} style={{opacity:.5}}/> {chatLabel(c.messages)}</div>
              <div style={{fontSize:"11px",color:C.txt3,paddingLeft:"22px"}}>{c.messages.filter(m=>m.type==="user").length} msg · {new Date(c.createdAt).toLocaleDateString([],{month:"short",day:"numeric"})}</div>
            </div>
            <div className="chat-actions" style={{position:"absolute", right:"8px", top:"50%", transform:"translateY(-50%)", display:"flex", gap:"4px"}}>
              {confirmDelChat === c.id ? (
                <button onClick={(e) => { e.stopPropagation(); delChat(c.id); }} style={{background:"#f6465d", color:"#fff", border:"none", borderRadius:"4px", padding:"2px 6px", fontSize:"10px", fontWeight:"600", cursor:"pointer"}}>Del</button>
              ) : (
                <button className="btn-mini-icon" onClick={(e) => { e.stopPropagation(); setConfirmDelChat(c.id); }} style={{padding:"4px", opacity:0.5}} title="Delete Chat"><Trash2 size={12}/></button>
              )}
            </div>
          </div>)}
        </div>
        <div style={{padding:"10px 12px",borderTop:`1px solid ${C.bdr}`,display:"flex",flexDirection:"column",gap:"8px",flexShrink:0}}>
          {activeChat && activeChat.messages.length > 0 && (
            <div style={{display:"flex", gap:"4px"}}>
              {confirmClear ? (
                <>
                  <button onClick={clearChat} style={{flex:1, background:"#f6465d", color:"#fff", border:"none", borderRadius:C.rSm, padding:"8px", fontSize:"12px", fontWeight:"600", cursor:"pointer"}}>Confirm Clear</button>
                  <button onClick={() => setConfirmClear(false)} style={{background:C.surf2, color:C.txt3, border:"none", borderRadius:C.rSm, padding:"8px", fontSize:"12px", cursor:"pointer"}}><X size={14}/></button>
                </>
              ) : (
                <button onClick={() => setConfirmClear(true)} style={{flex:1, display:"flex", alignItems:"center", justifyContent:"center", gap:"8px", padding:"8px", borderRadius:C.rSm, background:"transparent", border:`1px solid ${C.bdr}`, color:C.txt2, fontSize:"12px", cursor:"pointer"}} className="btn-hover">
                  <Trash2 size={14}/> Clear Chat
                </button>
              )}
            </div>
          )}
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
            <div style={{display:"flex",alignItems:"center",gap:"8px",overflow:"hidden"}}>
              <div style={{width:28,height:28,borderRadius:"50%",background:C.accBg,border:`1px solid ${C.accBdr}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:"12px",fontWeight:"600",color:C.acc,flexShrink:0}}><User size={16}/></div>
              <div style={{overflow:"hidden"}}>
                <div style={{fontSize:"12px",fontWeight:"500",color:C.txt,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{user.name}</div>
                <div style={{fontSize:"10px",color:C.txt3,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{user.email}</div>
              </div>
            </div>
            <div style={{display:"flex",gap:"4px",flexShrink:0}}>
              <button className="btn btn-ghost" onClick={()=>setShowSettings(!showSettings)} style={{fontSize:"12px",padding:"5px 8px",...(showSettings?{background:C.accBg,borderColor:C.accBdr,color:C.acc}:{})}}><Settings size={16}/></button>
              <button className="btn btn-ghost" onClick={logout} style={{fontSize:"12px",padding:"5px 8px"}}><LogOut size={16}/></button>
            </div>
          </div>
        </div>
      </div>

      <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden",position:"relative"}}>
        {showSettings&&<div style={{position:"absolute",top:0,right:0,width:360,height:"100%",zIndex:30,background:C.sideBg,borderLeft:`1px solid ${C.bdr}`,display:"flex",flexDirection:"column"}}>
          <SettingsPanel ais={ais} onAdd={addAI} onRemove={removeAI} onClose={()=>setShowSettings(false)} theme={theme} setTheme={setTheme}/>
        </div>}

        <div style={{padding:"9px 1rem",borderBottom:`1px solid ${C.bdr}`,background:C.sideBg,flexShrink:0,display:"flex",alignItems:"center",gap:"10px",minHeight:"48px",flexWrap:"wrap"}}>
          <button className="toggle-btn" onClick={()=>setSideOpen(p=>!p)} title={sideOpen?"Hide sidebar":"Show sidebar"}>{sideOpen?<ChevronLeft size={18}/>:<ChevronRight size={18}/>}</button>
          <div style={{fontSize:"13px",fontWeight:"500",color:C.txt,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:"180px",flex:"0 0 auto"}}>{activeChat?chatLabel(activeChat.messages):"AgentSworm"}</div>
          {ais.length>0&&<><div style={{width:"1px",height:"14px",background:C.bdr2,flexShrink:0}}/>
          <div style={{display:"flex",gap:"5px",flexWrap:"wrap",alignItems:"center",flex:1}}>
            {ais.map(ai=>{const p=pal(ai.colorIdx||0);const on=enabledIds.includes(ai.id);
              return <button key={ai.id} className="ai-toggle" onClick={()=>toggleAI(ai.id,!on)} style={{borderColor:on?p.bdr:C.bdr,background:on?p.bg:"transparent",color:on?p.fg:C.txt3}}>
                <span style={{width:5,height:5,borderRadius:"50%",background:on?p.fg:C.txt3,flexShrink:0}}/>{ai.name}
              </button>;})}
          </div></>}
          {ais.length===0&&<button className="btn btn-ghost" onClick={()=>setShowSettings(true)} style={{fontSize:"12px",padding:"5px 12px",display:"flex",alignItems:"center",gap:"6px"}}><Settings size={14}/> Connect an AI to start</button>}
        </div>

    <div className="sc" ref={scrollRef} onScroll={onScroll} style={{flex:1,overflowY:"auto",padding:"1.5rem",display:"flex",flexDirection:"column",gap:"1.25rem",position:"relative"}}>
      {showScrollBtn && (
        <button onClick={scrollToBottom} style={{position:"fixed", bottom:"100px", right:"24px", width:"36px", height:"36px", borderRadius:"50%", background:C.surf2, border:`1px solid ${C.bdr}`, color:C.txt, display:"flex", alignItems:"center", justifyContent:"center", boxShadow:"0 4px 12px rgba(0,0,0,0.15)", zIndex:10, cursor:"pointer"}} className="btn-hover">
          <ChevronDown size={20}/>
        </button>
      )}
      {!activeChat&&<div style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:"10px",paddingTop:"6rem"}}>
        <div style={{fontSize:"30px",fontWeight:"600",color:C.txt,letterSpacing:"-.02em",opacity:.2}}>AgentSworm</div>
        <div style={{fontSize:"13px",color:C.txt3,textAlign:"center",lineHeight:"1.6"}}>{ais.length===0?"Connect your first AI using the button above":"Start a new chat from the sidebar"}</div>
        {ais.length>0&&<button className="btn btn-ghost" onClick={newChat} style={{fontSize:"13px",padding:"9px 20px",marginTop:"4px",display:"flex",alignItems:"center",gap:"8px"}}><Plus size={16}/> New chat</button>}
        {ais.length===0&&<button className="btn btn-ghost" onClick={()=>setShowSettings(true)} style={{fontSize:"13px",padding:"9px 20px",marginTop:"4px",display:"flex",alignItems:"center",gap:"8px"}}><Settings size={16}/> Connect an AI</button>}
      </div>}

      {activeChat?.messages.map(msg=>{
        if(msg.type==="user"){
          const rMsg=msg.replyToId?activeChat.messages.find(m=>m.id===msg.replyToId):null;
          return (
            <div key={msg.id} className="msg-wrap" style={{display:"flex",justifyContent:"flex-end"}}>
              <div style={{maxWidth:"85%"}}>
                {rMsg&&<div style={{fontSize:"12px",color:C.txt3,padding:"6px 10px",background:C.surf,borderRadius:"8px 8px 0 0",borderLeft:`2px solid ${C.acc}`,lineHeight:"1.4",marginBottom:"1px"}}>
                  <span style={{fontSize:"10px",color:C.acc,fontWeight:"500",display:"block",marginBottom:"1px"}}>↩ {rMsg.aiName||""}</span>
                  {rMsg.content?.slice(0,80)}{rMsg.content?.length>80?"…":""}
                </div>}
                <div style={{background:C.surf2,padding:"11px 14px",borderRadius:rMsg?"0 10px 4px 10px":"14px 14px 4px 14px", position:"relative"}}>
                  <div style={{fontSize:"14px",color:C.txt,lineHeight:"1.65",whiteSpace:"pre-wrap"}}><Mentions text={msg.content} ais={ais}/></div>
                  <div style={{display:"flex", alignItems:"center", justifyContent:"space-between", marginTop:"4px"}}>
                    <button className="btn-mini-icon" onClick={()=>{navigator.clipboard.writeText(msg.content)}} style={{padding:"2px", opacity:0.3}} title="Copy"><Copy size={10}/></button>
                    <div style={{fontSize:"10px",color:C.txt3}}>{tStr(msg.timestamp)}</div>
                  </div>
                </div>
              </div>
            </div>
          );
        }
        const ai=ais.find(a=>a.id===msg.aiId);const p=ai?pal(ai.colorIdx||0):PALETTES[0];const isF=msg.type==="ai_followup";
        return (
          <div key={msg.id} className="msg-wrap" style={{display:"flex",gap:"10px",alignItems:"flex-start",paddingLeft:isF?"38px":"0"}}>
            <Av ai={ai} size={28}/>
            <div style={{flex:1,minWidth:0}}>
              <div style={{display:"flex",alignItems:"center",gap:"8px",marginBottom:"5px",flexWrap:"wrap"}}>
                <span style={{fontSize:"13px",fontWeight:"500",color:p.fg}}>{msg.aiName||ai?.name||"AI"}</span>
                {isF&&<span style={{fontSize:"10px",padding:"1px 6px",borderRadius:"999px",background:p.bg,color:p.fg,border:`1px solid ${p.bdr}`,fontWeight:"500"}}>follow-up</span>}
                {msg.loading&&<div style={{display:"inline-flex",alignItems:"center",gap:"8px"}}>
                  <span className="dot"/><span className="dot"/><span className="dot"/>
                  <button className="btn-mini-icon" onClick={()=>stopAI(msg.aiId)} style={{padding:"2px", color:"#f6465d"}} title="Stop"><XCircle size={14}/></button>
                </div>}
                {!msg.loading&&(msg.content||msg.error)&&<span style={{fontSize:"10px",color:C.txt3}}>{tStr(msg.timestamp)}</span>}
              </div>
              {msg.content&&<div className="ai-msg-box">
                <div className="markdown-body" style={{fontSize:"14px",color:C.txt,lineHeight:"1.75",marginBottom:"6px"}}>
                  <Markdown>{msg.content}</Markdown>
                </div>
                <div className="msg-actions" style={{display:"flex",gap:"8px",marginTop:"4px"}}>
                  <button className="btn-mini" onClick={()=>setReplyTo(msg)} title="Reply"><MessageSquare size={12}/> Reply</button>
                  <button className="btn-mini" onClick={()=>{navigator.clipboard.writeText(msg.content)}} title="Copy"><Copy size={12}/> Copy</button>
                  <button className="btn-mini" onClick={()=>regenerate(msg)} title="Regenerate" disabled={isLoading}><RefreshCw size={12}/> Retry</button>
                </div>
              </div>}
              {msg.error&&<div style={{display:"flex", flexDirection:"column", gap:"8px"}}>
                <div style={{fontSize:"13px",color:"#f6465d",padding:"9px 12px",background:"rgba(246,70,93,.08)",borderRadius:C.rSm,lineHeight:"1.5",display:"flex",alignItems:"center",gap:"8px"}}>
                  <AlertCircle size={14}/> {msg.error}
                </div>
                <button className="btn-mini" onClick={()=>regenerate(msg)} style={{alignSelf:"flex-start"}} disabled={isLoading}><RefreshCw size={12}/> Retry</button>
              </div>}
            </div>
          </div>
        );
      })}
          {phase2&&<div style={{display:"flex",alignItems:"center",gap:"8px",paddingLeft:"38px"}}>
            <span style={{fontSize:"11px",color:C.txt3,fontStyle:"italic"}}>AIs are discussing…</span>
            <span className="dot"/><span className="dot"/><span className="dot"/>
          </div>}
          <div ref={bottomRef}/>
        </div>

        <div style={{padding:"12px 1.5rem",borderTop:`1px solid ${C.bdr}`,background:C.sideBg,flexShrink:0,position:"relative"}}>
          {replyTo&&<div style={{display:"flex",alignItems:"center",gap:"8px",padding:"7px 12px",background:C.surf,borderRadius:C.rSm,marginBottom:"8px",borderLeft:`2px solid ${C.acc}`}}>
            <div style={{flex:1,fontSize:"12px",color:C.txt3,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
              <span style={{color:C.acc,fontWeight:"500"}}>{replyTo.aiName}: </span>{replyTo.content?.slice(0,80)}{replyTo.content?.length>80?"…":""}
            </div>
            <button onClick={()=>setReplyTo(null)} style={{background:"none",border:"none",color:C.txt3,cursor:"pointer",fontSize:"16px",lineHeight:1,padding:"0 2px"}}>×</button>
          </div>}
          {mentionQ!==null&&mentionList.length>0&&<div style={{position:"absolute",bottom:"100%",left:"1.5rem",right:"1.5rem",background:C.surf,border:`1px solid ${C.bdr2}`,borderRadius:C.rMd,padding:"8px",marginBottom:"4px",display:"flex",gap:"6px",flexWrap:"wrap",boxShadow:"0 -8px 32px rgba(0,0,0,.35)",zIndex:10}}>
            {mentionList.map(ai=>{const p=pal(ai.colorIdx||0);return <button key={ai.id} onClick={()=>insertMention(ai.name)}
              style={{display:"flex",alignItems:"center",gap:"7px",padding:"7px 11px",border:`1px solid ${p.bdr}`,borderRadius:"9px",cursor:"pointer",background:p.bg,color:p.fg,fontSize:"13px",fontWeight:"500",fontFamily:"'Inter',sans-serif"}}>
              <Av ai={ai} size={20}/>{ai.name}
            </button>;})}
          </div>}
          <div style={{display:"flex",gap:"8px",alignItems:"flex-end"}}>
            <textarea ref={taRef} value={input} onChange={onInputChange}
              onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();send();}if(e.key==="Escape"){setMentionQ(null);setReplyTo(null);}}}
              placeholder={enabledAIs.length>0?`Message ${enabledAIs.length} AI${enabledAIs.length>1?"s":""} · @ to mention one`:"Connect an AI to start chatting"}
              disabled={enabledAIs.length===0} rows={2} className="inp"
              style={{flex:1,resize:"none",fontSize:"14px",lineHeight:"1.6",padding:"11px 14px",fontFamily:"'Inter',sans-serif",background:C.surf}}/>
            <div style={{display:"flex", flexDirection:"column", gap:"4px"}}>
              <button className="btn btn-acc" onClick={send} disabled={isLoading||!input.trim()||enabledAIs.length===0}
                style={{padding:"11px 22px",fontSize:"14px",fontWeight:"500",whiteSpace:"nowrap",alignSelf:"stretch",borderRadius:C.rSm,display:"flex",alignItems:"center",gap:"8px"}}>
                {isLoading?"…":<><Send size={18}/> Send</>}
              </button>
              {isLoading && (
                <button className="btn btn-ghost" onClick={() => Object.keys(controllers.current).forEach(stopAI)} 
                  style={{padding:"4px", fontSize:"10px", color:"#f6465d", border:`1px solid rgba(246,70,93,.2)`}}>
                  Stop All
                </button>
              )}
            </div>
          </div>
          <div style={{fontSize:"11px",color:C.txt3,marginTop:"7px",display:"flex",gap:"10px",flexWrap:"wrap"}}>
            <span>Enter to send</span><span>·</span><span>Shift+Enter new line</span><span>·</span><span>@ to mention a specific AI</span><span>·</span><span>hover a message to quote it</span>
          </div>
        </div>
      </div>
    </div>
  </>
);
}

export default function App() {
  return (
    <ErrorBoundary>
      <AgentSwormApp />
    </ErrorBoundary>
  );
}
