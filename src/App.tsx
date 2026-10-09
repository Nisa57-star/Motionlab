/**
 * CAR RACE – GERAK LURUS (GLB & GLBB)
 * Interactive Educational Racing Game for SMP Physics
 * Designed specifically for Interactive Flat Panels (IFP) / Touchscreens
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { GameSettings, PlayerState, Question } from './types/game';
import { QUESTION_BANK } from './data/questions';
import { PLAYER_THEMES } from './data/playerThemes';
import { RaceTrack } from './components/RaceTrack';
import { PlayerStation } from './components/PlayerStation';
import { StartMenu } from './components/StartMenu';
import { ResultsScreen } from './components/ResultsScreen';
import { SoundPrompt } from './components/SoundPrompt';
import { sound } from './utils/audio';
import { RotateCcw, Volume2, VolumeX, Home, Award, Sparkles, FastForward, AlertTriangle, X } from 'lucide-react';

export default function App() {
  const [gameState, setGameState] = useState<'menu' | 'racing' | 'results'>('menu');
  const [settings, setSettings] = useState<GameSettings>({
    playerCount: 3,
    targetQuestions: 7,
    materialMode: 'all',
    soundEnabled: true,
  });

  const [players, setPlayers] = useState<PlayerState[]>([]);
  const [raceQuestions, setRaceQuestions] = useState<Question[]>([]);
  const [currentRoundIndex, setCurrentRoundIndex] = useState<number>(0);
  const [isRoundLocked, setIsRoundLocked] = useState<boolean>(false);
  const [roundWinnerName, setRoundWinnerName] = useState<string | null>(null);
  const [roundAnnouncement, setRoundAnnouncement] = useState<string | null>(null);
  const [finishCounter, setFinishCounter] = useState<number>(0);
  const [showResetModal, setShowResetModal] = useState<boolean>(false);

  // Filter question pool based on chosen material
  const filteredQuestionPool = useMemo(() => {
    if (settings.materialMode === 'glb') {
      return QUESTION_BANK.filter((q) => q.topic === 'GLB');
    }
    if (settings.materialMode === 'glbb') {
      return QUESTION_BANK.filter((q) => q.topic === 'GLBB');
    }
    return QUESTION_BANK;
  }, [settings.materialMode]);

  // Create shared race questions for all players
  // Everyone receives the exact same questions (Soal 1, Soal 2, Soal 3, dst.)
  const createSharedRaceQuestions = useCallback(
    (count: number): Question[] => {
      const graphList = filteredQuestionPool.filter((q) => !!q.graph);
      const nonGraphList = filteredQuestionPool.filter((q) => !q.graph);

      const shuffledGraphs = [...graphList].sort(() => Math.random() - 0.5);
      const shuffledNonGraphs = [...nonGraphList].sort(() => Math.random() - 0.5);

      const targetGraphCount = Math.min(
        shuffledGraphs.length,
        Math.max(1, Math.round(count * 0.35))
      );
      const targetNonGraphCount = count - targetGraphCount;

      const selected: Question[] = [
        ...shuffledGraphs.slice(0, targetGraphCount),
        ...shuffledNonGraphs.slice(0, targetNonGraphCount),
      ];

      if (selected.length < count) {
        const remaining = filteredQuestionPool
          .filter((q) => !selected.some((s) => s.id === q.id))
          .sort(() => Math.random() - 0.5);
        selected.push(...remaining.slice(0, count - selected.length));
      }

      return selected.sort(() => Math.random() - 0.5);
    },
    [filteredQuestionPool]
  );

  // Initialize or Reset Game
  const startNewRace = useCallback(() => {
    sound.playTurbo();
    setFinishCounter(0);
    setCurrentRoundIndex(0);
    setIsRoundLocked(false);
    setRoundWinnerName(null);
    setRoundAnnouncement(null);
    setShowResetModal(false);

    const sharedQuestions = createSharedRaceQuestions(settings.targetQuestions);
    setRaceQuestions(sharedQuestions);

    const initialPlayers: PlayerState[] = [];

    for (let i = 0; i < settings.playerCount; i++) {
      initialPlayers.push({
        id: i + 1,
        name: `Pemain ${i + 1}`,
        colorTheme: PLAYER_THEMES[i % PLAYER_THEMES.length],
        score: 0,
        correctCount: 0,
        wrongCount: 0,
        progress: 0,
        isFinished: false,
        questionIndex: 0,
        currentQuestion: sharedQuestions[0], // Soal #1 sama untuk semua pemain
        usedQuestionIds: [sharedQuestions[0].id],
        feedback: 'idle',
        isMoving: false,
        streak: 0,
        disabledKeys: [],
      });
    }

    setPlayers(initialPlayers);
    setGameState('racing');
  }, [settings.playerCount, settings.targetQuestions, createSharedRaceQuestions]);

  // Handle Player Answering
  // Competition buzzer mechanic: all players answer the same question!
  // When one player answers correctly:
  // - Their car moves forward
  // - Score increases
  // - The question advances for ALL players simultaneously to the next question!
  const handlePlayerAnswer = (playerId: number, selectedKey: 'A' | 'B' | 'C' | 'D') => {
    if (isRoundLocked || currentRoundIndex >= raceQuestions.length) return;

    const currentQuestion = raceQuestions[currentRoundIndex];
    if (!currentQuestion) return;

    const player = players.find((p) => p.id === playerId);
    if (!player || player.isFinished || player.feedback !== 'idle') return;

    // Check if key was already tried and wrong by this player
    if ((player.disabledKeys || []).includes(selectedKey)) return;

    const isCorrect = selectedKey === currentQuestion.correctAnswer;

    if (isCorrect) {
      // WINNER OF THIS ROUND! Lock round so other players cannot answer this question anymore
      setIsRoundLocked(true);
      setRoundWinnerName(player.name);
      sound.playCorrect();
      sound.playTurbo();

      const stepPercentage = 100 / settings.targetQuestions;
      const newProgress = Math.min(100, player.progress + stepPercentage);
      const newScore = player.score + 100;
      const newCorrectCount = player.correctCount + 1;
      const newStreak = player.streak + 1;
      const willFinish = newProgress >= 100;

      let rankToAssign = player.finishRank;
      if (willFinish && !player.isFinished) {
        rankToAssign = finishCounter + 1;
        setFinishCounter((prev) => prev + 1);
        sound.playFinish();
      }

      setRoundAnnouncement(
        `⚡ ${player.name} MENJAWAB BENAR DULUAN! MOBIL MELAJU (+100) 🏎️💨`
      );

      // Update state for all players: winner gets correct/movement, others get round-over notice
      setPlayers((prevPlayers) =>
        prevPlayers.map((p) => {
          if (p.id === playerId) {
            return {
              ...p,
              score: newScore,
              correctCount: newCorrectCount,
              progress: newProgress,
              feedback: 'correct',
              isMoving: true,
              streak: newStreak,
              isFinished: willFinish,
              finishRank: rankToAssign,
            };
          } else {
            return {
              ...p,
              feedback: 'round-over',
              isMoving: false,
            };
          }
        })
      );

      // Automated transition: advance ALL players together to next identical question
      setTimeout(() => {
        const nextRoundIndex = currentRoundIndex + 1;
        const raceIsFinished = willFinish || nextRoundIndex >= raceQuestions.length;

        if (raceIsFinished) {
          // Finish race and transition to podium
          setPlayers((prev) =>
            prev.map((p) => ({ ...p, isMoving: false, feedback: 'idle' }))
          );
          setTimeout(() => {
            setGameState('results');
          }, 1000);
        } else {
          // Advance to the next question for ALL players
          const nextQ = raceQuestions[nextRoundIndex];
          setCurrentRoundIndex(nextRoundIndex);
          setIsRoundLocked(false);
          setRoundWinnerName(null);
          setRoundAnnouncement(null);

          setPlayers((prev) =>
            prev.map((p) => ({
              ...p,
              questionIndex: nextRoundIndex,
              currentQuestion: nextQ,
              feedback: 'idle',
              isMoving: false,
              disabledKeys: [],
            }))
          );
        }
      }, 1250);
    } else {
      // WRONG ANSWER: Car does NOT move. Feedback and cooldown for this player only.
      sound.playWrong();

      setRoundAnnouncement(
        `⚠️ ${player.name} menjawab belum tepat! Pemain lain masih bisa menjawab!`
      );

      setPlayers((prevPlayers) =>
        prevPlayers.map((p) =>
          p.id === playerId
            ? {
                ...p,
                wrongCount: p.wrongCount + 1,
                feedback: 'wrong',
                isMoving: false,
                streak: 0,
                disabledKeys: [...(p.disabledKeys || []), selectedKey],
              }
            : p
        )
      );

      // Clear wrong banner after 1.5s
      setTimeout(() => {
        setRoundAnnouncement((current) =>
          current && current.includes(player.name) ? null : current
        );
      }, 1500);

      // Release player feedback after shake so they can try remaining options if round still open
      setTimeout(() => {
        setPlayers((prevPlayers) =>
          prevPlayers.map((p) =>
            p.id === playerId && p.feedback === 'wrong'
              ? { ...p, feedback: 'idle' }
              : p
          )
        );
      }, 850);
    }
  };

  // Skip Question (Teacher control if all players are stuck)
  const handleSkipQuestion = () => {
    if (isRoundLocked || gameState !== 'racing' || currentRoundIndex >= raceQuestions.length) return;
    setIsRoundLocked(true);
    sound.playClick();

    const currQ = raceQuestions[currentRoundIndex];
    setRoundAnnouncement(
      `⏭️ Soal dilewati! Kunci jawaban yang tepat adalah [${currQ.correctAnswer}]. Menyiapkan soal berikutnya...`
    );

    setTimeout(() => {
      const nextRoundIndex = currentRoundIndex + 1;
      if (nextRoundIndex >= raceQuestions.length) {
        setGameState('results');
      } else {
        const nextQ = raceQuestions[nextRoundIndex];
        setCurrentRoundIndex(nextRoundIndex);
        setIsRoundLocked(false);
        setRoundWinnerName(null);
        setRoundAnnouncement(null);

        setPlayers((prev) =>
          prev.map((p) => ({
            ...p,
            questionIndex: nextRoundIndex,
            currentQuestion: nextQ,
            feedback: 'idle',
            isMoving: false,
            disabledKeys: [],
          }))
        );
      }
    }, 1400);
  };

  // Check if all players have completed the race
  useEffect(() => {
    if (gameState === 'racing' && players.length > 0) {
      const allFinished = players.every((p) => p.isFinished);
      if (allFinished) {
        const timer = setTimeout(() => {
          setGameState('results');
        }, 1500);
        return () => clearTimeout(timer);
      }
    }
  }, [players, gameState]);

  // Toggle Sound
  const toggleSound = () => {
    sound.enabled = !settings.soundEnabled;
    if (sound.enabled) {
      sound.unlock();
      sound.playClick();
    }
    setSettings((prev) => ({ ...prev, soundEnabled: sound.enabled }));
  };

  // Render Current View
  if (gameState === 'menu') {
    return (
      <>
        <StartMenu
          settings={settings}
          onUpdateSettings={setSettings}
          onStartGame={startNewRace}
        />
        <SoundPrompt />
      </>
    );
  }

  if (gameState === 'results') {
    return (
      <>
        <ResultsScreen
          players={players}
          onPlayAgain={startNewRace}
          onBackToMenu={() => setGameState('menu')}
        />
        <SoundPrompt />
      </>
    );
  }

  // Active Racing View
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between p-2 sm:p-4 md:p-6 select-none overflow-x-hidden">
      {/* Background Ambience */}
      <div className="fixed inset-0 bg-[radial-gradient(ellipse_60%_50%_at_50%_0%,rgba(14,165,233,0.12),rgba(255,255,255,0))] pointer-events-none" />

      {/* Main Header Bar */}
      <header className="relative z-20 flex flex-wrap items-center justify-between gap-2 px-3 py-2 sm:px-4 sm:py-2.5 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-xl backdrop-blur-md mb-3">
        {/* Game Title & Topic */}
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center text-slate-950 font-black text-lg shadow-md font-race">
            🏎️
          </div>
          <div>
            <h1 className="font-race font-black text-sm sm:text-base md:text-lg text-slate-100 tracking-wide flex items-center gap-2">
              <span>CAR RACE</span>
              <span className="text-amber-400 font-bold text-xs sm:text-sm">
                · GERAK LURUS (GLB • GLBB)
              </span>
            </h1>
            <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
              <span className="text-cyan-400 font-bold">
                {players.length} Mobil Pemain
              </span>
              <span>·</span>
              <span className="text-amber-400 font-bold bg-amber-950/80 px-2 py-0.5 rounded border border-amber-500/30">
                Putaran {currentRoundIndex + 1} dari {settings.targetQuestions}
              </span>
              <span>·</span>
              <span className="text-emerald-400 font-bold bg-emerald-950/80 px-2 py-0.5 rounded border border-emerald-500/30">
                Soal Sama untuk Semua Tim
              </span>
              {finishCounter > 0 && (
                <>
                  <span>·</span>
                  <span className="text-amber-400 font-bold flex items-center gap-0.5">
                    <Sparkles className="w-3 h-3" />
                    {finishCounter} Finish
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Control Action Buttons */}
        <div className="flex items-center gap-2">
          {/* Skip Current Question Button (For Teacher) */}
          <button
            onClick={handleSkipQuestion}
            disabled={isRoundLocked}
            className={`p-2 sm:px-3 sm:py-2 rounded-xl border text-xs font-race font-bold transition-all active:scale-95 flex items-center gap-1.5 cursor-pointer shadow-md ${
              isRoundLocked
                ? 'bg-slate-900 border-slate-800 text-slate-600 cursor-not-allowed'
                : 'bg-slate-800 hover:bg-slate-700 active:bg-slate-600 border-slate-700 text-sky-300 hover:text-sky-200'
            }`}
            title="Lewati soal ini dan buka soal berikutnya untuk semua pemain"
          >
            <FastForward className="w-4 h-4 text-sky-400" />
            <span className="hidden sm:inline">LEWATI SOAL</span>
          </button>

          {/* Sound Toggle */}
          <button
            onClick={toggleSound}
            className="p-2 sm:px-3 sm:py-2 rounded-xl bg-slate-800 hover:bg-slate-700 active:bg-slate-600 border border-slate-700 text-slate-300 text-xs font-race font-bold transition-all active:scale-95 flex items-center gap-1.5 cursor-pointer"
            title="Pengaturan Suara"
          >
            {settings.soundEnabled ? (
              <Volume2 className="w-4 h-4 text-emerald-400" />
            ) : (
              <VolumeX className="w-4 h-4 text-slate-500" />
            )}
            <span className="hidden sm:inline">
              {settings.soundEnabled ? 'SUARA ON' : 'SUARA OFF'}
            </span>
          </button>

          {/* Reset Button (Opens In-App Confirmation Modal) */}
          <button
            onClick={() => {
              sound.playClick();
              setShowResetModal(true);
            }}
            className="p-2 sm:px-3.5 sm:py-2 rounded-xl bg-slate-800 hover:bg-slate-700 active:bg-slate-600 border border-slate-700 text-amber-300 hover:text-amber-200 text-xs font-race font-bold transition-all active:scale-95 flex items-center gap-1.5 cursor-pointer shadow-md"
            title="Reset Game ke Start"
          >
            <RotateCcw className="w-4 h-4 stroke-[2.5]" />
            <span>RESET</span>
          </button>

          {/* Selesaikan & Lihat Podium */}
          {finishCounter > 0 && (
            <button
              onClick={() => {
                sound.playClick();
                setGameState('results');
              }}
              className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-400 hover:from-amber-400 hover:to-yellow-300 text-slate-950 text-xs font-race font-black transition-all active:scale-95 flex items-center gap-1.5 cursor-pointer shadow-lg animate-pulse"
            >
              <Award className="w-4 h-4" />
              <span>LIHAT HASIL</span>
            </button>
          )}

          {/* Back to Menu */}
          <button
            onClick={() => {
              sound.playClick();
              setGameState('menu');
            }}
            className="p-2 sm:px-3 sm:py-2 rounded-xl bg-slate-800 hover:bg-slate-700 active:bg-slate-600 border border-slate-700 text-slate-300 text-xs font-race font-bold transition-all active:scale-95 flex items-center gap-1.5 cursor-pointer"
            title="Kembali ke Menu Utama"
          >
            <Home className="w-4 h-4" />
            <span className="hidden md:inline">MENU</span>
          </button>
        </div>
      </header>

      {/* LIVE ROUND ANNOUNCER / BANNER */}
      {roundAnnouncement && (
        <div className="relative z-30 mb-2 px-4 py-2 rounded-xl bg-cyan-950/90 border-2 border-cyan-400 text-cyan-200 font-race font-bold text-center text-xs sm:text-sm shadow-2xl backdrop-blur-md animate-pulse">
          {roundAnnouncement}
        </div>
      )}

      {/* RACE TRACK COMPONENT (Top half) */}
      <section className="relative z-10 w-full mb-3 sm:mb-4">
        <RaceTrack players={players} />
      </section>

      {/* QUESTION STATIONS FOR PLAYERS (Bottom half) */}
      <section className="relative z-10 w-full flex-1 flex flex-col justify-end">
        {/* Dynamic Responsive Grid for 2, 3, 4, 5 Players */}
        <div
          className={`grid gap-2.5 sm:gap-3.5 w-full ${
            players.length === 2
              ? 'grid-cols-1 md:grid-cols-2'
              : players.length === 3
              ? 'grid-cols-1 md:grid-cols-3'
              : players.length === 4
              ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4'
              : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5'
          }`}
        >
          {players.map((player) => (
            <PlayerStation
              key={player.id}
              player={player}
              onAnswer={handlePlayerAnswer}
              totalPlayers={players.length}
              totalQuestions={settings.targetQuestions}
              isRoundLocked={isRoundLocked}
              roundWinnerName={roundWinnerName}
            />
          ))}
        </div>
      </section>

      {/* In-App Reset Confirmation Modal (Replaces window.confirm) */}
      {showResetModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
          <div className="bg-slate-900 border-2 border-amber-500/80 rounded-2xl p-6 max-w-md w-full shadow-2xl text-center">
            <div className="w-12 h-12 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center mx-auto mb-3">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <h3 className="font-race font-black text-lg sm:text-xl text-slate-100 mb-2">
              ULANGI BALAPAN?
            </h3>
            <p className="text-sm text-slate-300 mb-6 leading-relaxed">
              Apakah Anda ingin mengulang balapan dari garis <strong className="text-emerald-400">START</strong>? Seluruh skor, progres lintasan mobil, dan urutan soal akan direset kembali.
            </p>
            <div className="flex items-center justify-center gap-3">
              <button
                onClick={() => setShowResetModal(false)}
                className="flex-1 py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 active:bg-slate-600 border border-slate-700 text-slate-200 font-race font-bold text-xs sm:text-sm cursor-pointer transition-all"
              >
                BATAL
              </button>
              <button
                onClick={startNewRace}
                className="flex-1 py-2.5 px-4 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-400 hover:from-amber-400 hover:to-yellow-300 active:scale-95 text-slate-950 font-race font-black text-xs sm:text-sm shadow-lg cursor-pointer transition-all"
              >
                YA, MULAI ULANG
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Autoplay Audio Safety Prompt */}
      <SoundPrompt />
    </div>
  );
}
