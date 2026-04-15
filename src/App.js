import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from "react";
import {
  Moon,
  Sun,
  Gavel,
  Skull,
  Eye,
  Shield,
  User,
  AlertCircle,
  Users,
  Key,
  Play,
  LogIn,
  LogOut,
  Trophy,
  Activity,
  Loader2,
  Bot,
  BookOpen,
  X,
  MessageCircle,
  Send,
} from "lucide-react";
import { initializeApp } from "firebase/app";
import { getAuth, signInAnonymously, onAuthStateChanged } from "firebase/auth";
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  updateDoc,
  onSnapshot,
  collection,
  deleteDoc,
  getDocs,
  writeBatch,
  deleteField,
  arrayUnion,
} from "firebase/firestore";

// ─── Firebase ───────────────────────────────────────────────────────────────
const firebaseConfig = {
  apiKey: "AIzaSyCzYEfUXgasASz8eDqymLHZPJNGM4Wgh-U",
  authDomain: "tyrant-finder.firebaseapp.com",
  projectId: "tyrant-finder",
  storageBucket: "tyrant-finder.firebasestorage.app",
  messagingSenderId: "887087516023",
  appId: "1:887087516023:web:9fcb04cc42b803184eb972",
};
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const APP_ID = "tyrant-finder";

// ─── 상수 ────────────────────────────────────────────────────────────────────
const MAX_LOGS = 60;
const MAX_CHAT = 100;

const GREEK_NAMES = [
  "소크라테스","플라톤","아리스토텔레스","페이디아스","알키비아데스",
  "클레온","테미스토클레스","솔론","클레이스테네스","아낙사고라스",
  "피타고라스","헤라클레이토스","파르메니데스","제논","에피쿠로스",
  "디오게네스","탈레스","호메로스","헤시오도스","아이스킬로스",
  "소포클레스","에우리피데스","아리스토파네스","투키디데스","헤로도토스",
  "크세노폰","플루타르코스","에피크테토스","아르키메데스","히포크라테스",
];

// ─── 유틸 ────────────────────────────────────────────────────────────────────
const getRoomRef = (code) =>
  doc(db, "artifacts", APP_ID, "public", "data", "rooms", code);
const getRoomsCol = () =>
  collection(db, "artifacts", APP_ID, "public", "data", "rooms");

function getRoleDistribution(count) {
  if (count < 6) return null;
  if (count === 6) return { 참주: 2, 페리클레스: 1, 시민: 3 };
  if (count === 7) return { 참주: 2, 페리클레스: 2, 시민: 3 };
  if (count === 8) return { 참주: 3, 페리클레스: 2, 시민: 3 };
  if (count === 9) return { 참주: 3, 페리클레스: 2, 시민: 4 };
  return { 참주: 4, 페리클레스: 2, 시민: count - 6 };
}

function checkWinCondition(playersMap) {
  const all = Object.values(playersMap).filter((p) => !p.isHost);
  const alive = all.filter((p) => p.isAlive);
  const total = all.filter((p) => p.role === "참주").length;
  const dead = total - alive.filter((p) => p.role === "참주").length;
  const winAt = total <= 2 ? total : Math.ceil(total * 0.75);
  if (dead >= winAt)
    return {
      isEnd: true,
      winner: "citizen",
      msg: `🎉 참주 ${dead}명이 추방되었습니다! 시민들의 승리입니다!`,
    };
  const evil = alive.filter((p) => p.role === "참주" || p.isHelper).length;
  if (evil >= alive.length - evil)
    return {
      isEnd: true,
      winner: "tyrant",
      msg: "💀 참주와 조력자들이 아테네를 장악했습니다! 참주의 승리입니다!",
    };
  return { isEnd: false };
}

const trimLogs = (logs) =>
  logs.length > MAX_LOGS ? logs.slice(-MAX_LOGS) : logs;
const trimChat = (msgs) =>
  msgs.length > MAX_CHAT ? msgs.slice(-MAX_CHAT) : msgs;

const mkLog = (message, type, extra = {}) => ({
  id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  message,
  type,
  time: new Date().toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" }),
  ...extra,
});

const mkChatMsg = (senderId, senderName, text) => ({
  id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  senderId,
  senderName,
  text,
  time: new Date().toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" }),
});

// ─── 비밀 채팅 컴포넌트 ──────────────────────────────────────────────────────
const SecretChat = React.memo(({ messages, onSend, myId, title, colorClass, isDark, isHost }) => {
  const [input, setInput] = useState("");
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages?.length]);

  const handleSend = () => {
    const trimmed = input.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setInput("");
  };

  return (
    <div className={`border-2 flex flex-col h-72 ${isDark ? "bg-slate-800 border-slate-600" : "bg-[#f4ecd8] border-[#8b694a]"}`}>
      <div className={`px-4 py-2 flex items-center gap-2 border-b ${isDark ? "border-slate-600" : "border-[#8b694a]"} ${colorClass}`}>
        <MessageCircle className="w-4 h-4" />
        <span className="font-black text-sm">{title}</span>
        {isHost && <span className="ml-auto text-xs opacity-70 font-bold">👁 방장 관전</span>}
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {(!messages || messages.length === 0) ? (
          <p className="text-xs text-center opacity-40 mt-4 font-bold">아직 메시지가 없습니다.</p>
        ) : (
          messages.map((msg) => {
            const isMine = msg.senderId === myId;
            return (
              <div key={msg.id} className={`flex flex-col ${isMine ? "items-end" : "items-start"}`}>
                {!isMine && (
                  <span className="text-xs font-black opacity-60 mb-0.5 px-1">{msg.senderName}</span>
                )}
                <div className={`max-w-[80%] px-3 py-1.5 text-sm font-bold rounded-sm ${
                  isMine
                    ? isDark ? "bg-indigo-600 text-white" : "bg-[#8b2500] text-[#f4ecd8]"
                    : isDark ? "bg-slate-700 text-gray-100" : "bg-[#e8e0cc] text-[#2c1e16]"
                }`}>
                  {msg.text}
                </div>
                <span className="text-xs opacity-40 px-1 mt-0.5">{msg.time}</span>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>
      {!isHost && (
        <div className={`p-2 border-t flex gap-2 ${isDark ? "border-slate-600" : "border-[#8b694a]"}`}>
          <input
            type="text"
            className={`flex-1 px-3 py-2 text-sm font-bold outline-none border ${
              isDark
                ? "bg-slate-700 border-slate-500 text-white placeholder-gray-400"
                : "bg-white border-[#8b694a] text-[#2c1e16]"
            }`}
            placeholder="메시지 입력..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSend()}
            maxLength={100}
          />
          <button
            onClick={handleSend}
            className={`px-3 py-2 font-bold text-sm border-2 transition ${
              isDark
                ? "bg-indigo-600 text-white border-indigo-800 hover:bg-indigo-700"
                : "bg-[#8b2500] text-[#f4ecd8] border-[#5c1800] hover:bg-red-800"
            }`}
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
});

// ─── 규칙 모달 ───────────────────────────────────────────────────────────────
const RulesModal = React.memo(({ onClose }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
    <div className="bg-[#f4ecd8] border-4 border-[#4a3525] shadow-2xl max-w-lg w-full max-h-[85vh] flex flex-col">
      <div className="flex items-center justify-between p-5 border-b-2 border-[#8b694a] shrink-0">
        <h2 className="text-2xl font-black text-[#2c1e16] flex items-center gap-2">
          <BookOpen className="w-6 h-6 text-[#8b2500]" /> 게임 방법
        </h2>
        <button onClick={onClose} className="p-1 hover:bg-[#e8e0cc] rounded transition">
          <X className="w-6 h-6 text-[#4a3525]" />
        </button>
      </div>
      <div className="overflow-y-auto p-6 space-y-5 text-[#2c1e16] text-sm font-bold">
        <div>
          <h3 className="text-base font-black text-[#8b2500] mb-2 border-b border-[#8b694a] pb-1">🏛️ 게임 개요</h3>
          <p>아테네 시민 중 숨어있는 <span className="text-red-700">참주</span>를 찾아 추방하는 추리 게임입니다.</p>
        </div>
        <div>
          <h3 className="text-lg font-black text-[#8b2500] mb-2 border-b border-[#8b694a] pb-1">📊 인원별 역할 배분</h3>
          <table className="w-full text-sm font-bold border-collapse">
            <thead>
              <tr className="bg-[#4a3525] text-[#f4ecd8]">
                <th className="p-2 text-left">인원</th>
                <th className="p-2 text-center">참주</th>
                <th className="p-2 text-center">페리클레스</th>
                <th className="p-2 text-center">시민</th>
              </tr>
            </thead>
            <tbody>
              {[[6,2,1,3],[7,2,2,3],[8,3,2,3],[9,3,2,4],["10+n",4,2,"그 외 n"]].map(([n,t,p,c]) => (
                <tr key={n} className="border-b border-[#8b694a] even:bg-[#e8e0cc]">
                  <td className="p-2">{n}명</td>
                  <td className="p-2 text-center text-red-700">{t}명</td>
                  <td className="p-2 text-center text-blue-700">{p}명</td>
                  <td className="p-2 text-center text-green-700">{c}명</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div>
          <h3 className="text-lg font-black text-[#8b2500] mb-3 border-b border-[#8b694a] pb-1">👤 역할 설명</h3>
          <div className="space-y-3">
            <div className="p-3 bg-red-50 border-l-4 border-red-700">
              <p className="font-black text-red-800">참주</p>
              <p className="text-sm font-bold mt-1">밤마다 시민 1명을 추방하고, 시민 1명을 조력자로 포섭할 수 있습니다.</p>
            </div>
            <div className="p-3 bg-blue-50 border-l-4 border-blue-700">
              <p className="font-black text-blue-800">페리클레스</p>
              <p className="text-sm font-bold mt-1">밤마다 2명을 지목하여 참주 여부를 조사합니다. <strong>페리클레스가 2명인 경우, 두 사람이 협의하여 반드시 같은 인물을 지목해야 합니다.</strong> 결과는 페리클레스 본인들만 확인할 수 있습니다.</p>
            </div>
            <div className="p-3 bg-green-50 border-l-4 border-green-700">
              <p className="font-black text-green-800">시민</p>
              <p className="text-sm font-bold mt-1">특별한 능력은 없지만 낮 투표에 참여하여 참주를 색출합니다.</p>
            </div>
            <div className="p-3 bg-purple-50 border-l-4 border-purple-700">
              <p className="font-black text-purple-800">조력자</p>
              <p className="text-sm font-bold mt-1">참주에게 포섭된 시민입니다. 참주가 누구인지 알게 되며, 참주편으로 승패가 결정됩니다. 참주 비밀 채팅에도 참여할 수 있습니다.</p>
            </div>
          </div>
        </div>
        <div>
          <h3 className="text-lg font-black text-[#8b2500] mb-3 border-b border-[#8b694a] pb-1">🔄 게임 진행 순서</h3>
          <ol className="space-y-2 text-sm font-bold">
            <li className="flex gap-2"><span className="text-[#8b2500] font-black shrink-0">1.</span> 방장이 게임을 시작하면 모든 참가자에게 역할이 비밀리에 배정됩니다.</li>
            <li className="flex gap-2"><span className="text-[#8b2500] font-black shrink-0">2.</span><span><span className="text-yellow-700">[낮]</span> 아고라에서 자유롭게 토론하며 참주를 추리합니다.</span></li>
            <li className="flex gap-2"><span className="text-[#8b2500] font-black shrink-0">3.</span><span><span className="text-orange-700">[투표]</span> 도편추방제로 가장 의심스러운 사람에게 투표합니다. 최다 득표자가 추방됩니다. (동률 시 무효)</span></li>
            <li className="flex gap-2"><span className="text-[#8b2500] font-black shrink-0">4.</span><span><span className="text-indigo-700">[밤]</span> 참주는 추방할 시민과 포섭할 시민을 선택합니다. 페리클레스는 참주 의심자 2명을 지목합니다.</span></li>
            <li className="flex gap-2"><span className="text-[#8b2500] font-black shrink-0">5.</span> 낮/투표/밤을 반복하며 승리 조건을 달성한 팀이 승리합니다.</li>
          </ol>
        </div>
        <div>
          <h3 className="text-lg font-black text-[#8b2500] mb-3 border-b border-[#8b694a] pb-1">🏆 승리 조건</h3>
          <div className="space-y-2">
            <div className="p-3 bg-[#e8e0cc] border border-[#8b694a] flex gap-3 items-start">
              <span className="text-2xl shrink-0">🎉</span>
              <div><p className="font-black text-green-800">시민 승리</p><p className="text-sm font-bold">참주의 과반수(4명 중 3명 등)가 추방되면 시민이 승리합니다.</p></div>
            </div>
            <div className="p-3 bg-[#e8e0cc] border border-[#8b694a] flex gap-3 items-start">
              <span className="text-2xl shrink-0">💀</span>
              <div><p className="font-black text-red-800">참주 승리</p><p className="text-sm font-bold">참주+조력자의 수가 시민 수 이상이 되면 참주가 승리합니다.</p></div>
            </div>
          </div>
        </div>
        <div>
          <h3 className="text-lg font-black text-[#8b2500] mb-3 border-b border-[#8b694a] pb-1">⚠️ 특수 규칙</h3>
          <ul className="space-y-2 text-sm font-bold">
            <li className="flex gap-2"><span className="text-[#8b2500] shrink-0">•</span> 참주가 페리클레스를 포섭하려 하면 참주의 정체가 전체 공개됩니다!</li>
            <li className="flex gap-2"><span className="text-[#8b2500] shrink-0">•</span> 페리클레스가 지목한 사람은 노예 상태가 되어 투표권을 잃습니다.</li>
            <li className="flex gap-2"><span className="text-[#8b2500] shrink-0">•</span> 페리클레스가 참주를 정확히 지목하면 모든 참주가 노예 상태가 되며 다음 밤 능력도 봉쇄됩니다.</li>
            <li className="flex gap-2"><span className="text-[#8b2500] shrink-0">•</span> 페리클레스의 조사 결과는 페리클레스 본인들만 게시판에서 볼 수 있습니다.</li>
          </ul>
        </div>
      </div>
      <div className="p-4 border-t-2 border-[#8b694a] shrink-0">
        <button onClick={onClose} className="w-full py-3 bg-[#8b2500] text-[#f4ecd8] font-black text-lg border-2 border-[#5c1800] shadow-[2px_2px_0px_#5c1800] hover:translate-y-[2px] hover:shadow-none transition-all">
          규칙 확인 완료
        </button>
      </div>
    </div>
  </div>
));

// ─── 메인 앱 ────────────────────────────────────────────────────────────────
export default function App() {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [showRules, setShowRules] = useState(false);
  const [showDestroyConfirm, setShowDestroyConfirm] = useState(false);
  const [showRoleAssign, setShowRoleAssign] = useState(false);
  const [manualRoles, setManualRoles] = useState({});
  const [screen, setScreen] = useState("home");
  const [myName, setMyName] = useState("");
  const [nameError, setNameError] = useState("");
  const [roomCodeInput, setRoomCodeInput] = useState("");
  const [expectedCount, setExpectedCount] = useState(10);
  const [isProcessing, setIsProcessing] = useState(false);
  const [availableRooms, setAvailableRooms] = useState([]);
  const [currentRoomCode, setCurrentRoomCode] = useState(null);
  const [roomData, setRoomData] = useState(null);
  const logsEndRef = useRef(null);
  const roomUnsubRef = useRef(null);
  const listUnsubRef = useRef(null);

  // ── 파생값 ───────────────────────────────────────────────────────────────
  const playersArr = useMemo(() => {
    if (!roomData?.players) return [];
    return Object.values(roomData.players).sort((a, b) => {
      if (a.isHost) return -1;
      if (b.isHost) return 1;
      return a.name.localeCompare(b.name);
    });
  }, [roomData?.players]);

  const activePlayers = useMemo(() => playersArr.filter((p) => !p.isHost), [playersArr]);
  const alivePlayers = useMemo(() => activePlayers.filter((p) => p.isAlive), [activePlayers]);
  const me = roomData?.players?.[user?.uid];
  const amIHost = me?.isHost === true;

  const aliveEvil = useMemo(() => alivePlayers.filter((p) => p.role === "참주" || p.isHelper).length, [alivePlayers]);
  const aliveGood = alivePlayers.length - aliveEvil;
  const totalTyrants = useMemo(() => activePlayers.filter((p) => p.role === "참주").length, [activePlayers]);
  const deadTyrants = useMemo(() => activePlayers.filter((p) => p.role === "참주" && !p.isAlive).length, [activePlayers]);
  const tyrantNames = useMemo(() => playersArr.filter((p) => p.role === "참주").map((p) => p.name).join(", "), [playersArr]);

  const otherPericles = useMemo(() => {
    if (me?.role !== "페리클레스" || !roomData?.players) return null;
    return Object.values(roomData.players).find((p) => p.role === "페리클레스" && p.id !== me.id && p.isAlive) || null;
  }, [me, roomData?.players]);

  // ── 채팅 접근 권한 ────────────────────────────────────────────────────────
  // [FIX] 조력자도 참주 채팅 참여 가능 (기존과 동일하나 명시적으로 분리)
  const canSeeTyrantChat = amIHost || me?.role === "참주" || me?.isHelper === true;
  const canSendTyrantChat = me?.role === "참주" || me?.isHelper === true;
  const canSeePericlesChat = amIHost || me?.role === "페리클레스";
  const canSendPericlesChat = me?.role === "페리클레스";

  // ── Auth ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    signInAnonymously(auth).catch(() => setErrorMessage("서버 인증에 실패했습니다."));
    return onAuthStateChanged(auth, (u) => { setUser(u); setAuthLoading(false); });
  }, []);

  // ── 유령방 청소 ───────────────────────────────────────────────────────────
  useEffect(() => {
    const ago = Date.now() - 3600_000;
    getDocs(getRoomsCol()).then((snap) => {
      const batch = writeBatch(db);
      let n = 0;
      snap.forEach((d) => {
        const data = d.data();
        if (data.phase === "setup" && data.createdAt < ago) { batch.delete(d.ref); n++; }
      });
      if (n) batch.commit();
    }).catch(console.error);
  }, []);

  // ── 방 실시간 구독 ────────────────────────────────────────────────────────
  useEffect(() => {
    if (roomUnsubRef.current) { roomUnsubRef.current(); roomUnsubRef.current = null; }
    if (!user || !currentRoomCode) return;
    roomUnsubRef.current = onSnapshot(getRoomRef(currentRoomCode), (snap) => {
      if (!snap.exists()) {
        setErrorMessage("방이 존재하지 않거나 방장에 의해 폭파되었습니다.");
        setCurrentRoomCode(null); setRoomData(null); setScreen("home");
        return;
      }
      setRoomData(snap.data());
    }, () => setErrorMessage("서버와 연결이 끊어졌습니다."));
    return () => { if (roomUnsubRef.current) roomUnsubRef.current(); };
  }, [user, currentRoomCode]);

  // ── 화면 전환 ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!user || !roomData) return;
    const myData = roomData.players[user.uid];
    if (!myData) {
      if (["lobby","game","role_reveal"].includes(screen)) {
        setErrorMessage("방에서 나왔거나 게임이 종료되었습니다.");
        setCurrentRoomCode(null); setRoomData(null); setScreen("home");
      }
      return;
    }
    if (["home","create_room","join_room"].includes(screen)) {
      if (roomData.phase === "setup") setScreen("lobby");
      else setScreen(myData.isHost ? "game" : "role_reveal");
    } else if (screen === "lobby" && roomData.phase !== "setup") {
      setScreen(myData.isHost ? "game" : "role_reveal");
    }
  }, [roomData, user]);

  // ── 방 목록 구독 ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (listUnsubRef.current) { listUnsubRef.current(); listUnsubRef.current = null; }
    if (!user || screen !== "join_room") return;
    listUnsubRef.current = onSnapshot(getRoomsCol(), (snap) => {
      const rooms = [];
      snap.forEach((d) => { const data = d.data(); if (data.phase === "setup") rooms.push(data); });
      rooms.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      setAvailableRooms(rooms);
    }, console.error);
    return () => { if (listUnsubRef.current) listUnsubRef.current(); };
  }, [user, screen]);

  // ── 로그 스크롤 ───────────────────────────────────────────────────────────
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [roomData?.logs?.length]);

  // ── 헬퍼 ──────────────────────────────────────────────────────────────────
  const getPlayerName = useCallback((id) => roomData?.players?.[id]?.name || "-", [roomData]);

  const canSeeLog = useCallback((log) => {
    if (!log.visibleTo) return true;
    if (amIHost) return true;
    return log.visibleTo.includes(user?.uid);
  }, [amIHost, user]);

  const generateRoomCode = () => {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
  };

  const getPericlesConsensus = useCallback((playersMap) => {
    const alive = Object.values(playersMap).filter((p) => p.isAlive && !p.isHost);
    const human = alive.find((p) => p.role === "페리클레스" && !p.isBot);
    if (human) return { t1: human.nightTarget || "", t2: human.nightTarget2 || "" };
    const others = alive.filter((p) => p.role !== "페리클레스").sort(() => Math.random() - 0.5);
    return { t1: others[0]?.id || "", t2: others[1]?.id || "" };
  }, []);

  // ── 채팅 전송 ─────────────────────────────────────────────────────────────
  // [FIX] arrayUnion 사용 → 배열 전체 덮어쓰기 대신 메시지 1개만 추가 (과부하 해결)
  // [FIX] 조력자 전송 권한 분리 (canSendTyrantChat)
  const sendChat = useCallback(async (chatType, text) => {
    if (!user || !currentRoomCode || !me) return;
    // 전송 권한 체크
    if (chatType === "tyrant" && !canSendTyrantChat) return;
    if (chatType === "pericles" && !canSendPericlesChat) return;
    const field = chatType === "tyrant" ? "tyrantChat" : "periclesChat";
    const msg = mkChatMsg(user.uid, me.name, text);
    try {
      // arrayUnion으로 메시지 1개만 원자적으로 추가 → 동시 전송 시 유실 없음
      await updateDoc(getRoomRef(currentRoomCode), { [field]: arrayUnion(msg) });
    } catch (e) {
      console.error(e);
    }
  }, [user, currentRoomCode, me, canSendTyrantChat, canSendPericlesChat]);

  // ── 방 생성 ───────────────────────────────────────────────────────────────
  const createRoom = useCallback(async () => {
    if (!user) return;
    if (expectedCount < 6) return setErrorMessage("최소 6명 이상의 인원을 설정해주세요.");
    setIsProcessing(true);
    const code = generateRoomCode();
    try {
      await setDoc(getRoomRef(code), {
        roomCode: code,
        hostId: user.uid,
        expectedCount,
        phase: "setup",
        dayCount: 0,
        logs: [],
        tyrantChat: [],
        periclesChat: [],
        winner: "",
        nextNightTyrantBlocked: false,
        createdAt: Date.now(),
        players: {
          [user.uid]: {
            id: user.uid, name: myName, role: "관리자", isHost: true,
            isAlive: true, isSlave: false, isHelper: false,
            nightTarget: "", nightTargetHelper: "", nightTarget2: "",
            voteTarget: "", isBot: false,
          },
        },
      });
      setCurrentRoomCode(code);
    } catch {
      setErrorMessage("방 생성 중 오류가 발생했습니다.");
    } finally {
      setIsProcessing(false);
    }
  }, [user, myName, expectedCount]);

  // ── 방 입장 ───────────────────────────────────────────────────────────────
  const joinRoom = useCallback(async (targetCode) => {
    if (!user) return;
    const code = String(targetCode || roomCodeInput).replace(/[^A-Za-z0-9]/g, "").toUpperCase();
    if (!code) return setErrorMessage("참여 코드를 올바르게 입력해주세요.");
    setIsProcessing(true);
    try {
      const snap = await getDoc(getRoomRef(code));
      if (!snap.exists()) return setErrorMessage(`[${code}] 방을 찾을 수 없습니다.`);
      const data = snap.data();
      if (data.hostId === user.uid) { setCurrentRoomCode(code); return; }

      let existing = data.players[user.uid];
      let oldUid = null;
      if (!existing && data.phase !== "setup") {
        const found = Object.entries(data.players).find(([, p]) => p.name === myName && !p.isBot);
        if (found) { [oldUid, existing] = found; }
      }
      if (data.phase !== "setup" && !existing)
        return setErrorMessage("이미 게임이 시작된 방입니다. 기존 이름으로 재접속해주세요.");

      if (oldUid && oldUid !== user.uid) {
        const batch = writeBatch(db);
        batch.update(getRoomRef(code), { [`players.${oldUid}`]: deleteField() });
        batch.update(getRoomRef(code), { [`players.${user.uid}`]: { ...existing, id: user.uid } });
        await batch.commit();
      } else if (!existing) {
        await updateDoc(getRoomRef(code), {
          [`players.${user.uid}`]: {
            id: user.uid, name: myName, role: "시민", isHost: false,
            isAlive: true, isSlave: false, isHelper: false,
            nightTarget: "", nightTargetHelper: "", nightTarget2: "",
            voteTarget: "", isBot: false,
          },
        });
      } else {
        await updateDoc(getRoomRef(code), { [`players.${user.uid}.name`]: myName });
      }
      setCurrentRoomCode(code);
    } catch (e) {
      console.error(e);
      setErrorMessage("방 입장에 실패했습니다.");
    } finally {
      setIsProcessing(false);
    }
  }, [user, myName, roomCodeInput]);

  // ── 방 폭파 ───────────────────────────────────────────────────────────────
  const destroyRoom = useCallback(async () => {
    if (!amIHost || !currentRoomCode) return;
    setIsProcessing(true);
    const code = currentRoomCode;
    setCurrentRoomCode(null); setRoomData(null); setShowDestroyConfirm(false); setScreen("home");
    try { await deleteDoc(getRoomRef(code)); }
    catch { setErrorMessage("방 삭제 중 오류가 발생했습니다."); }
    finally { setIsProcessing(false); }
  }, [amIHost, currentRoomCode]);

  // ── 방 나가기 ─────────────────────────────────────────────────────────────
  const leaveRoom = useCallback(async () => {
    if (!user || !currentRoomCode) return;
    const code = currentRoomCode;
    setCurrentRoomCode(null); setRoomData(null); setScreen("home");
    try { await updateDoc(getRoomRef(code), { [`players.${user.uid}`]: deleteField() }); }
    catch (e) { console.error(e); }
  }, [user, currentRoomCode]);

  // ── 봇 추가 ───────────────────────────────────────────────────────────────
  const addBot = useCallback(async () => {
    if (!amIHost || !roomData) return;
    setIsProcessing(true);
    const botId = "bot_" + Math.random().toString(36).slice(2, 9);
    const name = GREEK_NAMES[Math.floor(Math.random() * GREEK_NAMES.length)] + " (봇)";
    try {
      await updateDoc(getRoomRef(currentRoomCode), {
        [`players.${botId}`]: {
          id: botId, name, role: "시민", isHost: false,
          isAlive: true, isSlave: false, isHelper: false,
          nightTarget: "", nightTargetHelper: "", nightTarget2: "",
          voteTarget: "", isBot: true,
        },
      });
    } catch (e) { console.error(e); }
    finally { setIsProcessing(false); }
  }, [amIHost, roomData, currentRoomCode]);

  // ── 봇 자동 행동 ──────────────────────────────────────────────────────────
  const simulateBotActions = useCallback(async () => {
    if (!amIHost || !roomData) return;
    setIsProcessing(true);
    try {
      const alive = Object.values(roomData.players).filter((p) => p.isAlive && !p.isHost);
      const nonTyrants = alive.filter((p) => p.role !== "참주").sort(() => Math.random() - 0.5);
      const commonKill = nonTyrants[0]?.id || "";
      const commonHelp = nonTyrants[1]?.id || "";
      const consensus = roomData.phase === "night" ? getPericlesConsensus(roomData.players) : null;
      const updates = {};
      Object.values(roomData.players).forEach((p) => {
        if (!p.isBot || !p.isAlive) return;
        const others = alive.filter((t) => t.id !== p.id);
        if (!others.length) return;
        if (roomData.phase === "night") {
          if (p.role === "참주" && !roomData.nextNightTyrantBlocked) {
            if (commonKill) updates[`players.${p.id}.nightTarget`] = commonKill;
            if (commonHelp) updates[`players.${p.id}.nightTargetHelper`] = commonHelp;
          } else if (p.role === "페리클레스") {
            updates[`players.${p.id}.nightTarget`] = consensus?.t1 || "";
            updates[`players.${p.id}.nightTarget2`] = consensus?.t2 || "";
          }
        } else if (roomData.phase === "voting" && !p.isSlave) {
          updates[`players.${p.id}.voteTarget`] = others[Math.floor(Math.random() * others.length)].id;
        }
      });
      if (Object.keys(updates).length) await updateDoc(getRoomRef(currentRoomCode), updates);
    } catch (e) { console.error(e); }
    finally { setIsProcessing(false); }
  }, [amIHost, roomData, currentRoomCode, getPericlesConsensus]);

  // ── 게임 시작 (랜덤) ──────────────────────────────────────────────────────
  const startGame = useCallback(async () => {
    if (!amIHost || !roomData) return;
    if (activePlayers.length < 6) return setErrorMessage("최소 6명이 필요합니다.");
    const dist = getRoleDistribution(activePlayers.length);
    if (!dist) return setErrorMessage("인원이 너무 적습니다.");
    setIsProcessing(true);
    try {
      const roles = [
        ...Array(dist.참주).fill("참주"),
        ...Array(dist.페리클레스).fill("페리클레스"),
        ...Array(dist.시민).fill("시민"),
      ].sort(() => Math.random() - 0.5);
      const updates = {
        phase: "day", dayCount: 1,
        tyrantChat: [], periclesChat: [],
        logs: [mkLog(`🏛️ 민회 소집. 총 ${activePlayers.length}명. (참주 ${dist.참주}·페리클레스 ${dist.페리클레스}·시민 ${dist.시민})`, "system-info")],
      };
      activePlayers.forEach((p, i) => { updates[`players.${p.id}.role`] = roles[i]; });
      await updateDoc(getRoomRef(currentRoomCode), updates);
      setScreen("game");
    } catch { setErrorMessage("게임 시작에 실패했습니다."); }
    finally { setIsProcessing(false); }
  }, [amIHost, roomData, activePlayers, currentRoomCode]);

  // ── 게임 시작 (수동 배정) ─────────────────────────────────────────────────
  const startGameManual = useCallback(async () => {
    if (!amIHost || !roomData) return;
    if (activePlayers.length < 6) return setErrorMessage("최소 6명이 필요합니다.");
    const unassigned = activePlayers.filter((p) => !manualRoles[p.id]);
    if (unassigned.length) return setErrorMessage(`미배정: ${unassigned.map((p) => p.name).join(", ")}`);
    const dist = { 참주: 0, 페리클레스: 0, 시민: 0 };
    Object.values(manualRoles).forEach((r) => { if (r in dist) dist[r]++; });
    setIsProcessing(true);
    try {
      const updates = {
        phase: "day", dayCount: 1,
        tyrantChat: [], periclesChat: [],
        logs: [mkLog(`🏛️ 민회 소집. 총 ${activePlayers.length}명. (참주 ${dist.참주}·페리클레스 ${dist.페리클레스}·시민 ${dist.시민})`, "system-info")],
      };
      activePlayers.forEach((p) => { updates[`players.${p.id}.role`] = manualRoles[p.id]; });
      await updateDoc(getRoomRef(currentRoomCode), updates);
      setShowRoleAssign(false); setScreen("game");
    } catch { setErrorMessage("게임 시작에 실패했습니다."); }
    finally { setIsProcessing(false); }
  }, [amIHost, roomData, activePlayers, manualRoles, currentRoomCode]);

  const openRoleAssignModal = useCallback(() => {
    if (activePlayers.length < 6) return setErrorMessage("최소 6명이 필요합니다.");
    const init = {};
    activePlayers.forEach((p) => { init[p.id] = p.role && p.role !== "관리자" ? p.role : "시민"; });
    setManualRoles(init); setShowRoleAssign(true);
  }, [activePlayers]);

  // ── 밤 시작 ───────────────────────────────────────────────────────────────
  const startNight = useCallback(async () => {
    if (!amIHost || !roomData) return;
    const newDay = roomData.dayCount + 1;
    const updates = {
      phase: "night", dayCount: newDay,
      // [FIX] nextNightTyrantBlocked는 startDay에서만 설정 — 밤 시작 시 건드리지 않음
      logs: trimLogs([...roomData.logs, mkLog(`🌙 [제 ${newDay}일 밤] 참주와 페리클레스는 활동을 시작해주세요.`, "system-night")]),
    };
    Object.values(roomData.players).forEach((p) => {
      updates[`players.${p.id}.nightTarget`] = "";
      updates[`players.${p.id}.nightTargetHelper`] = "";
      updates[`players.${p.id}.nightTarget2`] = "";
      updates[`players.${p.id}.voteTarget`] = "";
    });
    await updateDoc(getRoomRef(currentRoomCode), updates);
  }, [amIHost, roomData, currentRoomCode]);

  // ── 낮 시작 (밤 결과) ─────────────────────────────────────────────────────
  const startDay = useCallback(async () => {
    if (!amIHost || !roomData) return;
    const pm = {};
    Object.values(roomData.players).forEach((p) => { pm[p.id] = { ...p, isSlave: false }; });
    const all = Object.values(pm);
    const logs = [];
    let killedId = null, helperId = null, nextBlocked = false;

    // 페리클레스 처리
    const pList = all.filter((p) => p.role === "페리클레스" && p.isAlive);
    const pIds = pList.map((p) => p.id);

    if (pList.length === 1) {
      const p = pList[0];
      const caught = [p.nightTarget, p.nightTarget2].filter(Boolean).filter((id) => pm[id]?.role === "참주");
      const t1n = pm[p.nightTarget]?.name || "(미선택)";
      const t2n = pm[p.nightTarget2]?.name || "(미선택)";
      if (caught.length) {
        all.forEach((q) => { if (q.role === "참주") pm[q.id].isSlave = true; });
        nextBlocked = true;
        logs.push(mkLog(`🔍 [조사] '${t1n}'·'${t2n}' 중 참주 발견! 참주: [${caught.map((id) => pm[id].name).join(", ")}]. 모든 참주 노예 강등·능력 봉쇄.`, "pericles-secret", { visibleTo: pIds }));
      } else {
        [p.nightTarget, p.nightTarget2].forEach((id) => { if (id && pm[id]) pm[id].isSlave = true; });
        logs.push(mkLog(`🔍 [조사] '${t1n}'·'${t2n}' 중 참주 없음. 지목자 투표권 박탈.`, "pericles-secret", { visibleTo: pIds }));
      }
    } else if (pList.length >= 2) {
      const [p1, p2] = pList;
      const agreed = p1.nightTarget && p2.nightTarget && p1.nightTarget === p2.nightTarget
        && p1.nightTarget2 && p2.nightTarget2 && p1.nightTarget2 === p2.nightTarget2;
      if (!agreed) {
        logs.push(mkLog("🔍 [조사] 두 페리클레스의 의견이 불일치하여 조사가 무효화되었습니다.", "pericles-secret", { visibleTo: pIds }));
        logs.push(mkLog("페리클레스들이 의견을 모으지 못했습니다. 조사 결과가 없습니다.", "normal"));
      } else {
        const caught = [p1.nightTarget, p1.nightTarget2].filter(Boolean).filter((id) => pm[id]?.role === "참주");
        const t1n = pm[p1.nightTarget]?.name || "(미선택)";
        const t2n = pm[p1.nightTarget2]?.name || "(미선택)";
        if (caught.length) {
          all.forEach((q) => { if (q.role === "참주") pm[q.id].isSlave = true; });
          nextBlocked = true;
          logs.push(mkLog(`🔍 [조사] '${t1n}'·'${t2n}' 중 참주 발견! 참주: [${caught.map((id) => pm[id].name).join(", ")}]. 모든 참주 노예·능력 봉쇄.`, "pericles-secret", { visibleTo: pIds }));
        } else {
          [p1.nightTarget, p1.nightTarget2].forEach((id) => { if (id && pm[id]) pm[id].isSlave = true; });
          logs.push(mkLog(`🔍 [조사] '${t1n}'·'${t2n}' 중 참주 없음. 지목자 투표권 박탈.`, "pericles-secret", { visibleTo: pIds }));
        }
      }
    }

    // 참주 처리
    // [FIX] isSlave(봉쇄)된 참주는 합의 카운트에서 제외
    if (!roomData.nextNightTyrantBlocked) {
      const tyrants = all.filter((p) => p.role === "참주" && p.isAlive && !p.isSlave);
      const kills = tyrants.map((t) => t.nightTarget).filter(Boolean);
      const helps = tyrants.map((t) => t.nightTargetHelper).filter(Boolean);
      const allKill = kills.length > 0 && kills.every((id) => id === kills[0]);
      const allHelp = helps.length > 0 && helps.every((id) => id === helps[0]);
      killedId = allKill ? kills[0] : null;
      helperId = allHelp ? helps[0] : null;

      if (tyrants.length > 1) {
        if (kills.length && !allKill) {
          logs.push(mkLog("⚠️ 참주들이 추방 대상을 합의하지 못했습니다. 추방이 무효화되었습니다.", "pericles-secret", { visibleTo: tyrants.map((t) => t.id) }));
          logs.push(mkLog("밤사이 아무런 일도 일어나지 않은 것 같습니다. (내부 불화)", "normal"));
        }
        if (helps.length && !allHelp) {
          logs.push(mkLog("⚠️ 참주들이 포섭 대상을 합의하지 못했습니다. 포섭이 무효화되었습니다.", "pericles-secret", { visibleTo: tyrants.map((t) => t.id) }));
        }
      }
    }

    if (helperId && pm[helperId]) {
      if (pm[helperId].role === "페리클레스") {
        const tNames = all.filter((p) => p.role === "참주" && p.isAlive).map((p) => p.name).join(", ");
        logs.push(mkLog(`🚨 참주가 페리클레스를 매수하려다 탄로! 참주: [${tNames}]`, "system-exile"));
      } else if (pm[helperId].role !== "참주") {
        pm[helperId] = { ...pm[helperId], isHelper: true };
        logs.push(mkLog(`🤝 새로운 조력자가 생겼습니다.`, "normal"));
      }
    }

    if (killedId && pm[killedId]) {
      pm[killedId] = { ...pm[killedId], isAlive: false };
      logs.push(mkLog(`어젯밤 ${pm[killedId].name}님이 참주에 의해 추방당했습니다.`, "system-kill"));
    } else if (!roomData.nextNightTyrantBlocked) {
      logs.push(mkLog("어젯밤에는 아무도 추방당하지 않았습니다.", "normal"));
    }

    const win = checkWinCondition(pm);
    if (win.isEnd) logs.push(mkLog(win.msg, win.winner === "citizen" ? "system-exile" : "system-kill"));

    // [FIX] 낮이 될 때 채팅 100개 초과분 트리밍 (arrayUnion으로 쌓인 것 정리)
    const trimmedTyrantChat = trimChat(roomData.tyrantChat || []);
    const trimmedPericlesChat = trimChat(roomData.periclesChat || []);

    const updates = {
      phase: win.isEnd ? "end" : "day",
      winner: win.isEnd ? win.winner : roomData.winner || "",
      // [FIX] nextNightTyrantBlocked: 이번 밤 페리클레스가 잡았으면 true, 아니면 false로 리셋
      nextNightTyrantBlocked: nextBlocked,
      logs: trimLogs([...roomData.logs, ...logs]),
      tyrantChat: trimmedTyrantChat,
      periclesChat: trimmedPericlesChat,
    };
    Object.values(pm).forEach((p) => {
      updates[`players.${p.id}.isAlive`] = p.isAlive;
      updates[`players.${p.id}.isSlave`] = p.isSlave;
      updates[`players.${p.id}.isHelper`] = p.isHelper;
    });
    await updateDoc(getRoomRef(currentRoomCode), updates);
  }, [amIHost, roomData, currentRoomCode]);

  // ── 투표 시작 ─────────────────────────────────────────────────────────────
  const startVoting = useCallback(async () => {
    if (!amIHost || !roomData) return;
    const updates = {
      phase: "voting",
      logs: trimLogs([...roomData.logs, mkLog("📢 도편추방제 시작! 참주로 의심되는 사람에게 투표하세요.", "system-vote")]),
    };
    Object.values(roomData.players).forEach((p) => { updates[`players.${p.id}.voteTarget`] = ""; });
    await updateDoc(getRoomRef(currentRoomCode), updates);
  }, [amIHost, roomData, currentRoomCode]);

  // ── 투표 종료 ─────────────────────────────────────────────────────────────
  const endVoting = useCallback(async () => {
    if (!amIHost || !roomData) return;
    const votes = {};
    // [FIX] 살아있는 플레이어의 투표만 집계 (사망자 투표 제외)
    Object.values(roomData.players).forEach((p) => {
      if (!p.isHost && p.isAlive && !p.isSlave && p.voteTarget)
        votes[p.voteTarget] = (votes[p.voteTarget] || 0) + 1;
    });
    const pm = {};
    Object.values(roomData.players).forEach((p) => { pm[p.id] = { ...p }; });
    const logs = [];

    if (!Object.keys(votes).length) {
      logs.push(mkLog("투표 기권으로 아무도 추방되지 않았습니다.", "normal"));
    } else {
      let max = 0, exiled = null, tie = false;
      for (const [id, cnt] of Object.entries(votes)) {
        if (cnt > max) { max = cnt; exiled = id; tie = false; }
        else if (cnt === max) tie = true;
      }
      if (tie) logs.push(mkLog("동률표로 아무도 추방되지 않았습니다.", "normal"));
      else if (exiled && pm[exiled]) {
        pm[exiled] = { ...pm[exiled], isAlive: false };
        logs.push(mkLog(`${pm[exiled].name}님이 도편추방제로 추방됐습니다. 정체: [${pm[exiled].role}]`, "system-exile"));
      }
    }

    const win = checkWinCondition(pm);
    if (win.isEnd) logs.push(mkLog(win.msg, win.winner === "citizen" ? "system-exile" : "system-kill"));

    const updates = {
      phase: win.isEnd ? "end" : "day",
      winner: win.isEnd ? win.winner : roomData.winner || "",
      logs: trimLogs([...roomData.logs, ...logs]),
    };
    Object.values(pm).forEach((p) => { updates[`players.${p.id}.isAlive`] = p.isAlive; });
    await updateDoc(getRoomRef(currentRoomCode), updates);
  }, [amIHost, roomData, currentRoomCode]);

  // ── 플레이어 액션 ─────────────────────────────────────────────────────────
  const handlePlayerAction = useCallback(async (type, targetId) => {
    if (!user || !currentRoomCode) return;
    const fieldMap = {
      night_kill: `players.${user.uid}.nightTarget`,
      night_help: `players.${user.uid}.nightTargetHelper`,
      night_peri_1: `players.${user.uid}.nightTarget`,
      night_peri_2: `players.${user.uid}.nightTarget2`,
      vote: `players.${user.uid}.voteTarget`,
    };
    if (!fieldMap[type]) return;
    try { await updateDoc(getRoomRef(currentRoomCode), { [fieldMap[type]]: targetId }); }
    catch { setErrorMessage("동작 전송에 실패했습니다."); }
  }, [user, currentRoomCode]);

  // ── 렌더링 ────────────────────────────────────────────────────────────────
  if (authLoading)
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#e8e0cc]">
        <Loader2 className="w-12 h-12 text-[#8b2500] animate-spin mb-4" />
        <p className="font-bold text-[#4a3525]">아고라 서버에 입장하는 중...</p>
      </div>
    );

  // ─ 홈 ────────────────────────────────────────────────────────────────────
  if (screen === "home")
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-[#e8e0cc] font-serif"
        style={{ backgroundImage: "radial-gradient(circle at center,#f4ecd8 0%,#e8e0cc 60%,#d5c6aa 100%)" }}>
        <style dangerouslySetInnerHTML={{ __html: `@import url('https://fonts.googleapis.com/css2?family=Noto+Serif+KR:wght@400;700;900&display=swap');.font-serif{font-family:'Noto Serif KR',serif;}` }} />
        {showRules && <RulesModal onClose={() => setShowRules(false)} />}
        <div className="relative w-full max-w-md bg-[#f4ecd8] border-[10px] border-[#4a3525] p-2 shadow-2xl z-10">
          <div className="relative z-10 bg-[#f4ecd8] bg-opacity-95 p-8 border-2 border-[#8b694a] flex flex-col items-center shadow-inner text-center">
            <h2 className="text-sm font-bold text-[#8b2500] tracking-widest mb-2 mt-4">아테네의 민주정을 노리는 그림자</h2>
            <h1 className="text-4xl sm:text-5xl font-black text-[#2c1e16] tracking-tight mb-4 leading-tight">참주를 찾아라!</h1>
            <div className="w-12 h-1 bg-[#8b694a] mb-4" />
            <p className="text-[#4a3525] font-bold leading-relaxed mb-8">시민들이여, 합심하여<br />숨어있는 참주를 색출하라!</p>
            <div className="w-full mb-6 text-left">
              <label className="block text-sm font-bold text-[#4a3525] mb-2">당신의 이름은 무엇입니까?</label>
              <input type="text"
                className={`w-full p-4 bg-[#e8e0cc] border-2 focus:outline-none text-lg text-[#3e2b1d] ${nameError ? "border-red-600" : "border-[#8b694a] focus:border-[#8b2500]"}`}
                placeholder="시민 이름 입력" value={myName}
                onChange={(e) => { setMyName(e.target.value); if (e.target.value.trim()) setNameError(""); }} />
              {nameError && <p className="text-red-600 font-bold text-sm mt-2 flex items-center gap-1"><AlertCircle className="w-4 h-4" />{nameError}</p>}
            </div>
            <div className="w-full space-y-3">
              <button onClick={() => { if (!myName.trim()) return setNameError("이름을 작성해주세요."); setScreen("create_room"); }}
                className="w-full py-4 bg-[#8b2500] text-[#f4ecd8] font-bold text-lg border-2 border-[#5c1800] shadow-[2px_2px_0px_#5c1800] hover:translate-y-[2px] hover:shadow-none transition-all flex items-center justify-center gap-2">
                <Users className="w-5 h-5" /> 아고라 개방 (방 만들기)
              </button>
              <button onClick={() => { if (!myName.trim()) return setNameError("이름을 작성해주세요."); setRoomCodeInput(""); setScreen("join_room"); }}
                className="w-full py-4 bg-transparent text-[#8b2500] font-bold text-lg border-2 border-[#8b2500] hover:bg-[#8b2500] hover:text-[#f4ecd8] transition-colors flex items-center justify-center gap-2">
                <LogIn className="w-5 h-5" /> 민회 참석 (방 찾기)
              </button>
              <button onClick={() => setShowRules(true)}
                className="w-full py-3 bg-transparent text-[#8b694a] font-bold text-sm border border-dashed border-[#8b694a] hover:bg-[#e8e0cc] transition-colors flex items-center justify-center gap-2">
                <BookOpen className="w-4 h-4" /> 게임 방법 보기
              </button>
            </div>
          </div>
        </div>
      </div>
    );

  const isDark = roomData?.phase === "night";

  return (
    <div className={`min-h-screen transition-colors duration-500 font-serif ${isDark ? "bg-slate-900 text-gray-100" : "bg-[#e8e0cc] text-gray-900"} p-4 md:p-8 pb-20`}>
      <style dangerouslySetInnerHTML={{ __html: `@import url('https://fonts.googleapis.com/css2?family=Noto+Serif+KR:wght@400;700;900&display=swap');.font-serif{font-family:'Noto Serif KR',serif;}` }} />

      {/* 폭파 확인 모달 */}
      {showDestroyConfirm && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4">
          <div className="bg-[#f4ecd8] border-4 border-red-800 p-6 max-w-sm w-full text-center shadow-2xl">
            <AlertCircle className="w-12 h-12 text-red-800 mx-auto mb-4" />
            <h3 className="text-xl font-bold text-[#4a3525] mb-2">방 폭파 경고</h3>
            <p className="text-[#2c1e16] font-bold mb-6">정말로 이 방을 폭파하시겠습니까?</p>
            <div className="flex gap-3">
              <button onClick={() => setShowDestroyConfirm(false)} className="flex-1 py-3 bg-gray-400 text-white font-bold border-2 border-gray-600">취소</button>
              <button onClick={destroyRoom} disabled={isProcessing} className="flex-1 py-3 bg-red-800 text-white font-bold border-2 border-red-900">
                {isProcessing ? "처리 중..." : "폭파하기"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 에러 모달 */}
      {errorMessage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-[#f4ecd8] border-4 border-[#8b2500] p-6 max-w-sm w-full text-center shadow-2xl">
            <AlertCircle className="w-12 h-12 text-[#8b2500] mx-auto mb-4" />
            <h3 className="text-xl font-bold text-[#4a3525] mb-2">알림</h3>
            <p className="text-[#2c1e16] font-bold mb-6 break-keep">{errorMessage}</p>
            <button onClick={() => setErrorMessage("")} className="w-full py-3 bg-[#8b2500] text-[#f4ecd8] font-bold border-2 border-[#5c1800]">확인</button>
          </div>
        </div>
      )}

      {/* ── 방 만들기 ── */}
      {screen === "create_room" && (
        <div className="flex items-center justify-center min-h-[80vh]">
          <div className="bg-[#f4ecd8] p-8 rounded-xl border-2 border-[#8b694a] shadow-xl max-w-md w-full">
            <h2 className="text-2xl font-black text-[#2c1e16] mb-6 flex items-center gap-2">
              <Users className="w-6 h-6 text-[#8b2500]" /> 아고라 개방
            </h2>
            <div className="mb-6">
              <label className="block text-sm font-bold text-[#4a3525] mb-2">예상 인원 (최소 6명)</label>
              <input type="number" className="w-full p-4 bg-[#e8e0cc] border-2 border-[#8b694a]"
                value={expectedCount} onChange={(e) => setExpectedCount(Number(e.target.value))} min="6" />
            </div>
            <div className="flex gap-3">
              <button onClick={() => setScreen("home")} className="flex-1 py-4 bg-transparent border-2 border-[#4a3525] text-[#4a3525] font-bold">뒤로</button>
              <button onClick={createRoom} disabled={isProcessing} className="w-2/3 py-4 bg-[#8b2500] text-[#f4ecd8] border-2 border-[#5c1800] font-bold">
                {isProcessing ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : "생성하기"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 방 찾기 ── */}
      {screen === "join_room" && (
        <div className="flex flex-col items-center justify-center min-h-[80vh] py-8">
          <div className="bg-[#f4ecd8] p-6 md:p-8 rounded-xl border-2 border-[#8b694a] shadow-xl max-w-lg w-full flex flex-col max-h-[90vh]">
            <h2 className="text-2xl font-black text-[#2c1e16] mb-6 flex items-center gap-2 shrink-0">
              <Key className="w-6 h-6 text-[#8b2500]" /> 민회 참석
            </h2>
            <div className="mb-6 shrink-0 bg-[#e8e0cc] p-4 border border-[#8b694a]">
              <label className="block text-sm font-bold text-[#4a3525] mb-2">코드 직접 입력</label>
              <div className="flex gap-2">
                <input type="text" placeholder="6자리 코드"
                  className="w-full p-3 bg-white border-2 border-[#8b694a] uppercase font-bold tracking-widest text-center text-lg focus:border-[#8b2500] outline-none"
                  value={roomCodeInput} onChange={(e) => setRoomCodeInput(e.target.value.toUpperCase())} />
                <button onClick={() => joinRoom(roomCodeInput)} disabled={isProcessing}
                  className="px-6 bg-[#8b2500] text-[#f4ecd8] border-2 border-[#5c1800] font-bold whitespace-nowrap">
                  {isProcessing ? <Loader2 className="w-5 h-5 animate-spin" /> : "입장"}
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-hidden flex flex-col border-t-2 border-dashed border-[#8b694a] pt-6 mb-6">
              <h3 className="text-lg font-bold text-[#4a3525] mb-4 flex items-center gap-2 shrink-0">
                <Activity className="w-5 h-5 text-green-700 animate-pulse" /> 모집 중인 방
              </h3>
              <div className="flex-1 overflow-y-auto pr-2 space-y-3">
                {availableRooms.length === 0 ? (
                  <div className="text-center py-10 bg-[#e8e0cc] border border-[#8b694a]">
                    <p className="font-bold text-[#4a3525]">현재 대기 중인 방이 없습니다.</p>
                  </div>
                ) : (
                  availableRooms.map((room) => (
                    <div key={room.roomCode} onClick={() => !isProcessing && joinRoom(room.roomCode)}
                      className="p-4 bg-white border-2 border-[#8b694a] hover:bg-[#d5c6aa] transition-colors cursor-pointer flex justify-between items-center">
                      <div>
                        <p className="font-black text-[#2c1e16] text-xl tracking-widest">{room.roomCode}</p>
                        <p className="text-sm text-[#4a3525] font-bold mt-1">방장: {room.players[room.hostId]?.name || "?"}</p>
                      </div>
                      <div className="text-right">
                        <span className="inline-block px-3 py-1 bg-[#8b2500] text-[#f4ecd8] text-xs font-bold rounded-sm mb-1">
                          {Object.keys(room.players).length}/{room.expectedCount}명
                        </span>
                        <p className="text-xs font-bold text-[#8b694a]">클릭하여 입장 →</p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
            <button onClick={() => setScreen("home")} className="w-full py-4 bg-transparent border-2 border-[#4a3525] text-[#4a3525] font-bold shrink-0">처음으로</button>
          </div>
        </div>
      )}

      {/* ── 대기실 ── */}
      {screen === "lobby" && (
        <div className="flex flex-col items-center">
          {showRoleAssign && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
              <div className="bg-[#f4ecd8] border-4 border-[#4a3525] shadow-2xl max-w-lg w-full max-h-[85vh] flex flex-col">
                <div className="flex items-center justify-between p-5 border-b-2 border-[#8b694a]">
                  <h2 className="text-xl font-black text-[#2c1e16]">역할 직접 배정</h2>
                  <button onClick={() => setShowRoleAssign(false)} className="p-1 hover:bg-[#e8e0cc] rounded"><X className="w-5 h-5 text-[#4a3525]" /></button>
                </div>
                <div className="overflow-y-auto p-5 space-y-3 flex-1">
                  <div className="flex justify-between text-xs font-bold px-1 mb-2">
                    <span className="text-red-700">참주: {Object.values(manualRoles).filter((r) => r === "참주").length}명</span>
                    <span className="text-blue-700">페리클레스: {Object.values(manualRoles).filter((r) => r === "페리클레스").length}명</span>
                    <span className="text-green-700">시민: {Object.values(manualRoles).filter((r) => r === "시민").length}명</span>
                  </div>
                  {activePlayers.map((p) => (
                    <div key={p.id} className="flex items-center justify-between bg-[#e8e0cc] p-3 border border-[#8b694a]">
                      <span className="font-bold text-[#2c1e16]">{p.name} {p.isBot && "🤖"}</span>
                      <div className="flex gap-2">
                        {["참주","페리클레스","시민"].map((role) => (
                          <button key={role} onClick={() => setManualRoles((prev) => ({ ...prev, [p.id]: role }))}
                            className={`px-3 py-1.5 text-xs font-black border-2 transition ${manualRoles[p.id] === role
                              ? role === "참주" ? "bg-red-700 text-white border-red-900"
                                : role === "페리클레스" ? "bg-blue-700 text-white border-blue-900"
                                : "bg-green-700 text-white border-green-900"
                              : "bg-white text-[#4a3525] border-[#8b694a] hover:bg-[#d5c6aa]"}`}>
                            {role}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="p-4 border-t-2 border-[#8b694a] flex gap-3">
                  <button onClick={() => setShowRoleAssign(false)} className="flex-1 py-3 bg-gray-400 text-white font-bold border-2 border-gray-600">취소</button>
                  <button onClick={startGameManual} disabled={isProcessing} className="w-2/3 py-3 bg-[#8b2500] text-[#f4ecd8] font-black border-2 border-[#5c1800]">
                    {isProcessing ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : "이대로 게임 시작"}
                  </button>
                </div>
              </div>
            </div>
          )}
          <div className="w-full max-w-3xl bg-[#f4ecd8] p-6 md:p-10 border-2 border-[#8b694a] shadow-xl">
            <div className="text-center mb-10">
              <h2 className="text-3xl font-black text-[#2c1e16] mb-2">대기실</h2>
              <div className="inline-block bg-[#e8e0cc] border-2 border-[#8b694a] text-[#4a3525] px-8 py-4 mt-4 select-all">
                <p className="text-sm font-bold mb-1 opacity-70">참여 코드</p>
                <p className="text-5xl font-black tracking-[0.2em]">{currentRoomCode}</p>
              </div>
            </div>
            <div className="mb-8">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-xl font-bold text-[#4a3525] flex items-center gap-2">
                  <Users className="w-5 h-5" /> 참가자 <span className="text-[#8b2500]">({activePlayers.length}{amIHost ? `/${roomData?.expectedCount}` : ""})</span>
                </h3>
                {amIHost && (
                  <button onClick={addBot} disabled={isProcessing}
                    className="flex items-center gap-1 px-3 py-1.5 bg-indigo-100 text-indigo-800 border border-indigo-300 font-bold text-sm rounded hover:bg-indigo-200">
                    <Bot className="w-4 h-4" /> 봇 추가
                  </button>
                )}
              </div>
              <div className="bg-[#e8e0cc] p-4 border border-[#8b694a] min-h-[100px] shadow-inner">
                <div className="flex flex-wrap gap-2">
                  {activePlayers.length === 0 ? (
                    <span className="text-[#a68a6d] text-sm">아직 참가자가 없습니다.</span>
                  ) : (
                    activePlayers.map((p) => (
                      <div key={p.id} className={`px-4 py-2 font-bold text-sm border-2 ${
                        p.id === me?.id ? "bg-[#8b2500] text-[#f4ecd8] border-[#5c1800]"
                          : p.isBot ? "bg-indigo-600 text-white border-indigo-800"
                          : "bg-[#f4ecd8] text-[#4a3525] border-[#8b694a]"}`}>
                        {p.name} {p.id === me?.id && "(나)"} {p.isBot && "🤖"}
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
            <div className="border-t border-[#8b694a] pt-8 flex flex-col items-center gap-4">
              {amIHost ? (
                <>
                  <div className="flex gap-3 w-full justify-center flex-wrap">
                    <button onClick={startGame} disabled={isProcessing}
                      className="px-8 py-5 bg-[#8b2500] text-[#f4ecd8] font-black text-lg border-2 border-[#5c1800] shadow-[3px_3px_0px_#5c1800] hover:translate-y-[3px] hover:shadow-none transition flex items-center gap-2">
                      {isProcessing ? <Loader2 className="w-5 h-5 animate-spin" /> : <Play className="w-5 h-5" />} 랜덤 시작
                    </button>
                    <button onClick={openRoleAssignModal} disabled={isProcessing}
                      className="px-8 py-5 bg-[#4a3525] text-[#f4ecd8] font-black text-lg border-2 border-[#2c1e16] shadow-[3px_3px_0px_#2c1e16] hover:translate-y-[3px] hover:shadow-none transition flex items-center gap-2">
                      <Users className="w-5 h-5" /> 직접 배정
                    </button>
                  </div>
                  <button onClick={() => setShowDestroyConfirm(true)} className="mt-2 text-red-800 text-sm font-bold hover:underline flex items-center gap-1">
                    <AlertCircle className="w-4 h-4" /> 방 폭파시키기
                  </button>
                </>
              ) : (
                <div className="flex flex-col items-center gap-4 w-full">
                  <div className="p-6 bg-[#e8e0cc] border border-[#8b694a] w-full text-center">
                    <div className="animate-pulse text-[#8b2500] font-bold text-lg">방장이 게임을 시작하기를 기다리고 있습니다...</div>
                  </div>
                  <button onClick={leaveRoom} disabled={isProcessing} className="mt-2 text-[#4a3525] text-sm font-bold hover:underline flex items-center gap-1">
                    <LogOut className="w-4 h-4" /> 방 나가기
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── 역할 공개 ── */}
      {screen === "role_reveal" && !amIHost && (
        <div className="flex items-center justify-center min-h-[80vh]">
          <div className="bg-[#2c1e16] p-10 border-4 border-[#8b694a] shadow-2xl max-w-md w-full text-center">
            <h2 className="text-2xl font-bold text-[#e8e0cc] mb-8">당신의 정체는...</h2>
            <div className={`py-12 px-6 mb-8 border-2 bg-[#f4ecd8] ${me?.role === "참주" ? "border-red-800" : "border-[#8b694a]"}`}>
              <h1 className={`text-5xl font-black mb-4 ${me?.role === "참주" ? "text-red-800" : me?.role === "페리클레스" ? "text-blue-800" : "text-[#8b2500]"}`}>
                {me?.role}
              </h1>
            </div>
            <button onClick={() => setScreen("game")} className="w-full py-4 bg-[#8b694a] text-[#f4ecd8] font-bold text-lg">
              확인 완료 (게임 입장)
            </button>
          </div>
        </div>
      )}

      {/* ── 게임 ── */}
      {screen === "game" && roomData && (
        <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">

            {/* 게임 헤더 */}
            <div className={`p-6 border-2 shadow-lg flex items-center justify-between ${isDark ? "bg-slate-800 border-slate-600 text-white" : "bg-[#f4ecd8] border-[#8b694a]"}`}>
              <div>
                <h1 className="text-2xl font-black mb-1 flex items-center gap-2">
                  🏛️ 참주를 찾아라!
                  <span className="text-sm font-normal px-2 py-0.5 bg-black/10 rounded">Code: {currentRoomCode}</span>
                </h1>
                <p className="text-sm font-bold opacity-70">
                  {roomData.phase === "setup" && "게임 준비 중"}
                  {roomData.phase === "day" && `제 ${roomData.dayCount}일 낮`}
                  {roomData.phase === "night" && `제 ${roomData.dayCount}일 밤`}
                  {roomData.phase === "voting" && `제 ${roomData.dayCount}일 - 투표 중`}
                  {roomData.phase === "end" && `게임 종료 - ${roomData.winner === "citizen" ? "시민" : "참주"}의 승리`}
                </p>
              </div>
              {roomData.phase === "night" ? <Moon className="w-12 h-12 text-yellow-400" />
                : roomData.phase === "end" ? <Trophy className="w-12 h-12 text-yellow-600" />
                : <Sun className="w-12 h-12 text-[#8b2500]" />}
            </div>

            {/* 방장 관리 패널 */}
            {amIHost && (
              <div className={`p-5 shadow-md border-2 ${isDark ? "bg-slate-800/80 border-slate-600" : "bg-[#e8e0cc] border-[#8b694a]"}`}>
                <h2 className="text-lg font-bold mb-3 flex items-center gap-2 text-[#8b2500]">
                  <Gavel className="w-5 h-5" /> 게임 관리 (방장 전용)
                </h2>
                {roomData.phase !== "setup" && roomData.phase !== "end" && (
                  <div className="mb-4 p-3 bg-red-50 border border-red-800 rounded-sm">
                    <h4 className="font-bold text-red-800 mb-2 text-sm flex items-center gap-1"><Users className="w-4 h-4" /> 실시간 세력</h4>
                    <div className="flex justify-between bg-white p-2 border border-red-200 text-sm font-black">
                      <span className="text-red-700">참주편: {aliveEvil}명</span>
                      <span className="text-blue-700">시민편: {aliveGood}명</span>
                      <span className="text-orange-700">참주 추방: {deadTyrants}/{totalTyrants}</span>
                    </div>
                  </div>
                )}
                <div className="flex flex-wrap gap-2 mb-5">
                  {roomData.phase !== "end" && (
                    <>
                      {(roomData.phase === "setup" || roomData.phase === "day") && (
                        <>
                          <button onClick={startVoting} className="px-4 py-2 bg-red-800 text-[#f4ecd8] font-bold text-sm hover:bg-red-900 transition">도편추방제 시작</button>
                          <button onClick={startNight} className="px-4 py-2 bg-[#4a3525] text-[#f4ecd8] font-bold text-sm hover:bg-[#2c1e16] transition">
                            {roomData.phase === "setup" ? "첫 번째 밤" : "밤으로 변경"}
                          </button>
                        </>
                      )}
                      {roomData.phase === "night" && (
                        <>
                          <button onClick={simulateBotActions} disabled={isProcessing} className="px-4 py-2 bg-indigo-600 text-white font-bold text-sm hover:bg-indigo-700 transition flex items-center gap-1">
                            <Bot className="w-4 h-4" />봇 자동 행동
                          </button>
                          <button onClick={startDay} className="px-4 py-2 bg-[#8b2500] text-[#f4ecd8] font-bold text-sm hover:bg-red-800 transition">낮으로 변경 (결과 적용)</button>
                        </>
                      )}
                      {roomData.phase === "voting" && (
                        <>
                          <button onClick={simulateBotActions} disabled={isProcessing} className="px-4 py-2 bg-indigo-600 text-white font-bold text-sm hover:bg-indigo-700 transition flex items-center gap-1">
                            <Bot className="w-4 h-4" />봇 자동 투표
                          </button>
                          <button onClick={endVoting} className="px-4 py-2 bg-green-800 text-[#f4ecd8] font-bold text-sm hover:bg-green-900 transition">투표 마감 및 결과 발표</button>
                        </>
                      )}
                    </>
                  )}
                  <button onClick={() => setShowDestroyConfirm(true)} className="px-4 py-2 bg-gray-600 text-white font-bold text-sm ml-auto hover:bg-red-800 transition">방 폭파</button>
                </div>
                <div className="bg-white/60 p-4 rounded border border-[#8b694a]/30 overflow-x-auto">
                  <h3 className="font-bold mb-3 flex items-center gap-2 text-[#4a3525]"><Activity className="w-5 h-5" /> 실시간 모니터링</h3>
                  <table className="w-full text-sm text-left border-collapse">
                    <thead>
                      <tr className="border-b-2 border-[#8b694a] text-[#8b2500]">
                        <th className="p-2">이름</th><th className="p-2">역할</th><th className="p-2">상태</th><th className="p-2">액션</th>
                      </tr>
                    </thead>
                    <tbody>
                      {activePlayers.map((p) => (
                        <tr key={p.id} className={`border-b border-black/10 ${!p.isAlive ? "opacity-40 bg-gray-200" : ""}`}>
                          <td className="p-2 font-bold">{p.name} {p.isBot && "🤖"} {p.isHelper && <span className="text-xs text-purple-600 font-black">(조력자)</span>}</td>
                          <td className="p-2">{p.role}</td>
                          <td className="p-2">
                            {p.isAlive ? (p.isSlave ? <span className="text-yellow-600 font-bold">생존(노예)</span> : <span className="text-green-600 font-bold">생존</span>) : <span className="text-red-600 font-bold">사망</span>}
                          </td>
                          <td className="p-2 font-mono text-xs">
                            {roomData.phase === "night" && p.role === "참주" && p.isAlive && !roomData.nextNightTyrantBlocked && (
                              <><div className="text-red-600">추방: {getPlayerName(p.nightTarget)}</div><div className="text-green-600">포섭: {getPlayerName(p.nightTargetHelper)}</div></>
                            )}
                            {roomData.phase === "night" && p.role === "참주" && p.isAlive && roomData.nextNightTyrantBlocked && (
                              <span className="text-red-500 font-bold">능력 봉쇄됨</span>
                            )}
                            {roomData.phase === "night" && p.role === "페리클레스" && p.isAlive && (
                              <span className="text-blue-600">지목: {getPlayerName(p.nightTarget)}, {getPlayerName(p.nightTarget2)}</span>
                            )}
                            {roomData.phase === "voting" && p.isAlive && !p.isSlave && (
                              <span className="text-orange-600">투표: {getPlayerName(p.voteTarget)}</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* 방장용 채팅 관전 */}
                <div className="mt-5 space-y-4">
                  <h3 className="font-bold text-[#4a3525] flex items-center gap-2 border-t border-[#8b694a] pt-4">
                    <MessageCircle className="w-5 h-5" /> 비밀 채팅 관전 (방장 전용)
                  </h3>
                  <SecretChat
                    messages={roomData.tyrantChat || []}
                    onSend={() => {}}
                    myId={user?.uid}
                    title="🔴 참주 비밀 채팅 (참주 + 조력자)"
                    colorClass="bg-red-900 text-red-100"
                    isDark={isDark}
                    isHost={true}
                  />
                  <SecretChat
                    messages={roomData.periclesChat || []}
                    onSend={() => {}}
                    myId={user?.uid}
                    title="🔵 페리클레스 비밀 채팅"
                    colorClass="bg-blue-900 text-blue-100"
                    isDark={isDark}
                    isHost={true}
                  />
                </div>
              </div>
            )}

            {/* 플레이어 상태 패널 */}
            <div className={`p-6 border-2 shadow-lg ${isDark ? "bg-slate-800 border-slate-600" : "bg-[#f4ecd8] border-[#8b694a]"}`}>
              <div className="flex justify-between items-center mb-6 border-b border-black/10 pb-4">
                <h2 className="text-xl font-bold flex items-center gap-2">
                  <User className="w-6 h-6" /> {me?.name}
                </h2>
                <div className="flex items-center gap-3">
                  <span className={`px-4 py-1.5 font-black tracking-wide border-2 ${
                    amIHost ? "border-gray-500 text-gray-700"
                      : me?.role === "참주" ? "border-red-800 text-red-800"
                      : me?.role === "페리클레스" ? "border-blue-800 text-blue-800"
                      : me?.isHelper ? "border-purple-800 text-purple-800"
                      : "border-green-800 text-green-800"}`}>
                    {amIHost ? "관리자(방장)" : me?.isHelper ? "시민 (조력자)" : me?.role}
                  </span>
                  {!amIHost && (
                    <button onClick={leaveRoom} disabled={isProcessing}
                      className={`p-1.5 border rounded transition ${isDark ? "bg-slate-700 hover:bg-red-900/50 text-gray-300 border-slate-500" : "bg-white hover:bg-red-50 text-gray-600 hover:text-red-800 border-[#8b694a]/30"}`}
                      title="방 나가기">
                      <LogOut className="w-5 h-5" />
                    </button>
                  )}
                </div>
              </div>

              {!amIHost && (me?.role === "참주" || me?.isHelper) && me?.isAlive && roomData.phase !== "setup" && (
                <div className="mb-6 p-4 bg-red-50 border border-red-800 rounded-sm">
                  <h4 className="font-bold text-red-800 mb-2 flex items-center gap-2"><Users className="w-5 h-5" /> 실시간 세력 현황</h4>
                  <div className="flex justify-between bg-white p-3 border border-red-200">
                    <span className="font-black text-red-700 text-lg">참주편: {aliveEvil}명</span>
                    <span className="font-black text-blue-700 text-lg">시민편: {aliveGood}명</span>
                  </div>
                </div>
              )}

              {roomData.phase === "end" ? (
                <div className="text-center p-10 bg-gradient-to-br from-yellow-200 to-yellow-400 border-2 border-yellow-600">
                  <Trophy className="w-20 h-20 text-yellow-700 mx-auto mb-4" />
                  <h3 className="text-2xl font-black mb-2">게임 종료!</h3>
                  <p className="text-lg font-bold">
                    {roomData.winner === "citizen" ? "아테네에 평화가 찾아왔습니다. 시민들의 승리입니다!" : "참주가 아테네를 장악했습니다. 참주의 승리입니다!"}
                  </p>
                </div>
              ) : amIHost ? (
                <div className="text-center p-8 bg-[#e8e0cc] border-2 border-[#8b694a]">
                  <Shield className="w-16 h-16 text-[#8b694a] mx-auto mb-4" />
                  <h3 className="text-xl font-black mb-2 text-[#4a3525]">관리자(방장) 시점입니다.</h3>
                  <p className="text-sm font-bold opacity-80">위의 게임 관리 패널로 진행해 주세요.</p>
                </div>
              ) : !me?.isAlive ? (
                <div className="text-center p-8 bg-red-100 border-2 border-red-800">
                  <Skull className="w-16 h-16 text-red-800 mx-auto mb-4" />
                  <h3 className="text-xl font-black text-red-800">당신은 추방당했습니다.</h3>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* [FIX] 조력자 알림 — 참주 채팅 안내 문구 추가 */}
                  {me?.isHelper && roomData.phase !== "night" && (
                    <div className="p-5 bg-purple-100 text-purple-900 border-2 border-purple-600 flex gap-4">
                      <Eye className="w-8 h-8 shrink-0 text-purple-700 mt-1" />
                      <div>
                        <p className="font-black text-lg mb-1">참주의 제안을 받았습니다!</p>
                        <p className="font-bold text-sm mb-3">이제 <span className="text-red-600">참주편(조력자)</span>입니다. 아래 참주 비밀 채팅에 참여할 수 있습니다.</p>
                        <div className="bg-white/60 p-3 border border-purple-300 rounded-sm">
                          <span className="text-xs font-bold block mb-1 text-purple-800">👑 참주 목록</span>
                          <span className="font-black text-red-700 text-lg">{tyrantNames}</span>
                        </div>
                      </div>
                    </div>
                  )}
                  {me?.isSlave && roomData.phase !== "night" && (
                    <div className="p-5 bg-yellow-100 text-yellow-900 border-2 border-yellow-600 flex gap-4">
                      <AlertCircle className="w-8 h-8 shrink-0" />
                      <div><p className="font-bold text-lg">노예 상태입니다.</p><p>오늘 낮 투표권이 박탈됩니다.</p></div>
                    </div>
                  )}
                  {roomData.phase === "night" && (
                    <div className="p-5 bg-slate-700 border-2 border-slate-500 shadow-inner text-white">
                      {me?.role === "참주" ? (
                        roomData.nextNightTyrantBlocked ? (
                          <div className="text-center py-8">
                            <Moon className="w-12 h-12 text-red-500 mx-auto mb-3 opacity-50" />
                            <p className="font-black text-xl text-red-400 mb-2">능력 봉쇄됨!</p>
                            <p className="font-bold text-sm text-gray-300">페리클레스에게 발각되어 오늘 밤 능력을 사용할 수 없습니다.</p>
                          </div>
                        ) : (
                          <div className="space-y-4">
                            <h3 className="font-bold text-red-400 flex items-center gap-2"><Skull className="w-5 h-5" /> 참주의 결정</h3>
                            <div>
                              <label className="block text-sm text-red-300 font-bold mb-1">1. 추방시킬 시민</label>
                              <select className="w-full p-3 bg-slate-800 border border-slate-600 font-bold"
                                value={me.nightTarget || ""} onChange={(e) => handlePlayerAction("night_kill", e.target.value)}>
                                <option value="">-- 선택 안함 --</option>
                                {alivePlayers.filter((p) => p.id !== me.id && p.role !== "참주").map((p) => (
                                  <option key={p.id} value={p.id}>{p.name}</option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <label className="block text-sm text-green-300 font-bold mb-1">2. 포섭할 시민</label>
                              <select className="w-full p-3 bg-slate-800 border border-slate-600 font-bold"
                                value={me.nightTargetHelper || ""} onChange={(e) => handlePlayerAction("night_help", e.target.value)}>
                                <option value="">-- 선택 안함 --</option>
                                {alivePlayers.filter((p) => p.id !== me.id && p.role !== "참주").map((p) => (
                                  <option key={p.id} value={p.id}>{p.name}</option>
                                ))}
                              </select>
                            </div>
                          </div>
                        )
                      ) : me?.role === "페리클레스" ? (
                        <div className="space-y-4">
                          <h3 className="font-bold text-blue-400 flex items-center gap-2"><Shield className="w-5 h-5" /> 참주 의심자 지목</h3>
                          {otherPericles && (
                            <div className={`p-3 rounded border ${otherPericles.isBot ? "bg-indigo-900/40 border-indigo-500" : "bg-blue-900/40 border-blue-500"}`}>
                              <p className="text-xs font-bold mb-2 flex items-center gap-1 text-blue-300">
                                {otherPericles.isBot ? <><Bot className="w-3 h-3" />봇({otherPericles.name}) — 당신 선택 자동 복사</> : <><Shield className="w-3 h-3" />동료({otherPericles.name})의 현재 선택</>}
                              </p>
                              {!otherPericles.isBot && (
                                <div className="text-sm font-bold text-blue-200 flex gap-4">
                                  <span>1번: {getPlayerName(otherPericles.nightTarget) !== "-" ? getPlayerName(otherPericles.nightTarget) : <span className="opacity-50">미선택</span>}</span>
                                  <span>2번: {getPlayerName(otherPericles.nightTarget2) !== "-" ? getPlayerName(otherPericles.nightTarget2) : <span className="opacity-50">미선택</span>}</span>
                                </div>
                              )}
                            </div>
                          )}
                          <select className="w-full p-3 bg-slate-800 border border-slate-600 font-bold"
                            value={me.nightTarget || ""} onChange={(e) => handlePlayerAction("night_peri_1", e.target.value)}>
                            <option value="">-- 첫 번째 의심자 --</option>
                            {alivePlayers.filter((p) => p.id !== me.id).map((p) => (
                              <option key={p.id} value={p.id}>{p.name}</option>
                            ))}
                          </select>
                          <select className="w-full p-3 bg-slate-800 border border-slate-600 font-bold"
                            value={me.nightTarget2 || ""} onChange={(e) => handlePlayerAction("night_peri_2", e.target.value)}>
                            <option value="">-- 두 번째 의심자 --</option>
                            {alivePlayers.filter((p) => p.id !== me.id).map((p) => (
                              <option key={p.id} value={p.id}>{p.name}</option>
                            ))}
                          </select>
                          {otherPericles && !otherPericles.isBot && (
                            (otherPericles.nightTarget && me.nightTarget && otherPericles.nightTarget !== me.nightTarget) ||
                            (otherPericles.nightTarget2 && me.nightTarget2 && otherPericles.nightTarget2 !== me.nightTarget2)
                          ) && (
                            <div className="p-3 bg-yellow-900/50 border border-yellow-500 rounded text-yellow-200 text-xs font-bold flex items-start gap-2">
                              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-yellow-400" />
                              <span>동료 페리클레스와 선택이 다릅니다! 반드시 동일하게 맞춰야 능력이 발동됩니다.</span>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="text-center py-8">
                          <Moon className="w-12 h-12 text-gray-500 mx-auto mb-3 opacity-50" />
                          <p className="font-bold text-lg">{me?.isHelper ? "조력자로서 참주를 돕고 있습니다." : "당신은 시민입니다."}</p>
                        </div>
                      )}
                    </div>
                  )}
                  {/* [FIX] 투표 시 isSlave 체크 — 노예는 투표 UI 숨김 */}
                  {roomData.phase === "voting" && !me?.isSlave && (
                    <div className="p-5 bg-[#e8e0cc] border-2 border-[#8b694a] shadow-inner">
                      <h3 className="font-bold text-lg flex items-center gap-2 mb-2"><Gavel className="w-5 h-5" /> 도편추방제 투표</h3>
                      <select className="w-full p-4 border-2 border-[#8b694a] bg-[#f4ecd8] font-bold"
                        value={me.voteTarget || ""} onChange={(e) => handlePlayerAction("vote", e.target.value)}>
                        <option value="">-- 추방할 사람 선택 (기권 가능) --</option>
                        {/* [FIX] 살아있는 사람만 투표 대상에 표시 */}
                        {alivePlayers.filter((p) => p.id !== me.id).map((p) => (
                          <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                      </select>
                    </div>
                  )}
                  {roomData.phase === "voting" && me?.isSlave && (
                    <div className="p-5 bg-yellow-100 border-2 border-yellow-600 text-center">
                      <p className="font-bold text-yellow-800">노예 상태로 이번 투표에 참여할 수 없습니다.</p>
                    </div>
                  )}
                  {roomData.phase === "day" && (
                    <div className="text-center py-8 bg-black/5 rounded">
                      <Sun className="w-12 h-12 text-[#8b2500] mx-auto mb-3" />
                      <p className="font-bold text-lg">낮 시간입니다. 아고라에서 토론을 진행하세요.</p>
                    </div>
                  )}
                  {roomData.phase === "setup" && (
                    <p className="text-center py-8 font-bold text-lg opacity-70">방장이 게임을 시작하기를 기다리고 있습니다.</p>
                  )}
                </div>
              )}
            </div>

            {/* ── 비밀 채팅 (플레이어용) ── */}
            {!amIHost && me?.isAlive && roomData.phase !== "end" && (canSeeTyrantChat || canSeePericlesChat) && (
              <div className="space-y-4">
                {canSeeTyrantChat && (
                  <SecretChat
                    messages={roomData.tyrantChat || []}
                    onSend={(text) => sendChat("tyrant", text)}
                    myId={user?.uid}
                    title={`🔴 참주 비밀 채팅${me?.isHelper ? " (조력자 참여 중)" : ""}`}
                    colorClass="bg-red-900 text-red-100"
                    isDark={isDark}
                    isHost={false}
                  />
                )}
                {canSeePericlesChat && (
                  <SecretChat
                    messages={roomData.periclesChat || []}
                    onSend={(text) => sendChat("pericles", text)}
                    myId={user?.uid}
                    title="🔵 페리클레스 비밀 채팅"
                    colorClass="bg-blue-900 text-blue-100"
                    isDark={isDark}
                    isHost={false}
                  />
                )}
              </div>
            )}
          </div>

          {/* 사이드바 */}
          <div className="space-y-6">
            {/* 게시판 */}
            <div className={`p-5 border-2 shadow-lg h-[26rem] flex flex-col ${isDark ? "bg-slate-800 border-slate-600" : "bg-[#f4ecd8] border-[#8b694a]"}`}>
              <h3 className="font-black text-lg mb-4 border-b border-black/10 pb-3">📜 아고라 게시판</h3>
              <div className="flex-1 overflow-y-auto space-y-3 pr-2">
                {roomData.logs.length === 0 ? (
                  <p className="opacity-50 text-sm text-center mt-4">새로운 소식이 없습니다.</p>
                ) : (
                  roomData.logs.filter(canSeeLog).map((log) => (
                    <div key={log.id} className={`p-3 text-sm border ${
                      log.type === "system-night" ? "bg-indigo-900 text-indigo-100 border-indigo-700"
                        : log.type === "system-kill" ? "bg-red-100 text-red-900 border-red-800 font-bold"
                        : log.type === "system-vote" ? "bg-orange-100 text-orange-900 border-orange-800 font-bold"
                        : log.type === "system-exile" ? "bg-red-800 text-white border-red-900 font-black"
                        : log.type === "system-info" ? "bg-[#4a3525] text-[#f4ecd8] border-[#2c1e16] font-bold"
                        : log.type === "pericles-secret" ? "bg-blue-900 text-blue-100 border-blue-700 italic"
                        : "bg-[#e8e0cc] text-[#2c1e16] border-[#8b694a]"}`}>
                      <span className="text-xs opacity-60 block mb-1 font-mono">{log.time}</span>
                      {log.message}
                      {log.type === "pericles-secret" && <span className="block mt-1 text-xs text-blue-300 font-bold">🔒 비공개 정보</span>}
                    </div>
                  ))
                )}
                <div ref={logsEndRef} />
              </div>
            </div>

            {/* 명부 */}
            <div className={`p-5 border-2 shadow-lg max-h-[20rem] overflow-y-auto ${isDark ? "bg-slate-800 border-slate-600" : "bg-[#f4ecd8] border-[#8b694a]"}`}>
              <h3 className="font-black text-lg mb-4 border-b border-black/10 pb-3 flex justify-between items-center">
                👥 아테네 명부 <span className="text-sm font-normal px-2 py-1 bg-black/10">생존: {alivePlayers.length}명</span>
              </h3>
              <ul className="space-y-2">
                {activePlayers.map((p) => (
                  <li key={p.id} className={`p-3 flex justify-between items-center border ${!p.isAlive ? "opacity-40 bg-black/10 border-transparent" : "bg-[#e8e0cc] border-[#8b694a]"}`}>
                    <span className={`font-bold ${!p.isAlive ? "line-through" : ""}`}>{p.name} {p.isBot && "🤖"}</span>
                    <span className={`text-xs font-bold px-2 py-1 border ${p.isAlive ? "bg-green-100 text-green-800 border-green-800" : "bg-red-100 text-red-800 border-red-800"}`}>
                      {p.isAlive ? "생존" : "추방됨"}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
