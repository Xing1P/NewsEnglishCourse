import {
  BookOpen,
  CheckCircle2,
  ChevronRight,
  Download,
  FileText,
  GraduationCap,
  HelpCircle,
  Home,
  Loader2,
  Moon,
  Repeat,
  Search,
  Settings,
  Sparkles,
  Star,
  Sun,
  Trash2,
  Volume2,
  Wand2,
  Zap
} from "lucide-react";
import type { ReactElement, ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  ArticleExtraction,
  CourseLevel,
  CourseProgressEvent,
  CourseSummary,
  ExerciseType,
  GenerateCourseInput,
  GeminiStatus,
  ReviewCard,
  ReviewGrade,
  ReviewStats,
  StoredCourse,
  StoredSentence,
  StoredVocabulary,
  VerbForms
} from "../../shared/schemas";

type Page = "home" | "courses" | "vocabulary" | "review" | "settings" | "course";

const levels: CourseLevel[] = ["A2-B1", "B1-B2", "B2-C1"];
const exerciseTypes: ExerciseType[] = ["quiz", "cloze", "matching", "true_false", "reorder", "translation"];

function App(): ReactElement {
  const [page, setPage] = useState<Page>("home");
  const [courses, setCourses] = useState<CourseSummary[]>([]);
  const [vocabulary, setVocabulary] = useState<StoredVocabulary[]>([]);
  const [selectedCourse, setSelectedCourse] = useState<StoredCourse | null>(null);
  const [highlightSentenceId, setHighlightSentenceId] = useState<string | null>(null);
  const [geminiStatus, setGeminiStatus] = useState<GeminiStatus | null>(null);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage?.getItem("dark-mode") === "1";
  });
  const [reviewStats, setReviewStats] = useState<ReviewStats | null>(null);

  useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.classList.toggle("dark", darkMode);
    window.localStorage?.setItem("dark-mode", darkMode ? "1" : "0");
  }, [darkMode]);

  const refreshLibrary = useCallback(async (): Promise<void> => {
    const [courseRows, vocabRows] = await Promise.all([
      window.newsEnglish.course.list(),
      window.newsEnglish.vocabulary.list({ bookmarkedOnly: false })
    ]);
    setCourses(courseRows);
    setVocabulary(vocabRows);
    try {
      setReviewStats(await window.newsEnglish.review.stats());
    } catch {
      setReviewStats(null);
    }
  }, []);

  useEffect(() => {
    refreshLibrary().catch((error) => setGlobalError(toMessage(error)));
    window.newsEnglish.system.checkGemini().then(setGeminiStatus).catch((error) => {
      setGeminiStatus({ installed: false, path: null, version: null, error: toMessage(error) });
    });
  }, [refreshLibrary]);

  const openCourse = async (id: string, sentenceId?: string): Promise<void> => {
    setGlobalError(null);
    const course = await window.newsEnglish.course.get(id);
    if (!course) {
      setGlobalError("Course not found.");
      return;
    }
    setSelectedCourse(course);
    setHighlightSentenceId(sentenceId ?? null);
    setPage("course");
  };

  const reloadSelectedCourse = useCallback(async (): Promise<void> => {
    if (!selectedCourse) return;
    const updated = await window.newsEnglish.course.get(selectedCourse.id);
    if (updated) setSelectedCourse(updated);
    await refreshLibrary();
  }, [refreshLibrary, selectedCourse]);

  const afterGenerate = async (course: StoredCourse): Promise<void> => {
    await refreshLibrary();
    setSelectedCourse(course);
    setPage("course");
  };

  return (
    <div
      className="flex h-screen overflow-hidden bg-paper text-ink dark:bg-slate-950 dark:text-slate-100"
      data-testid="app-shell"
    >
      <aside className="sticky top-0 flex h-screen w-64 shrink-0 flex-col border-r border-ink/10 bg-white/80 px-4 py-5 dark:border-white/10 dark:bg-slate-900/70">
        <div className="mb-8 flex items-center gap-3 px-2">
          <div className="grid h-11 w-11 place-items-center rounded-lg bg-teal text-white shadow-panel">
            <GraduationCap size={23} />
          </div>
          <div>
            <p className="text-base font-semibold leading-tight">News English</p>
            <p className="text-xs text-ink/55 dark:text-slate-400">Khmer course builder</p>
          </div>
        </div>
        <nav className="space-y-1">
          <NavButton active={page === "home"} icon={<Home size={18} />} label="Home" onClick={() => setPage("home")} />
          <NavButton
            active={page === "courses" || page === "course"}
            icon={<BookOpen size={18} />}
            label="Courses"
            onClick={() => setPage("courses")}
          />
          <NavButton
            active={page === "vocabulary"}
            icon={<Star size={18} />}
            label="Vocabulary"
            onClick={() => setPage("vocabulary")}
          />
          <NavButton
            active={page === "review"}
            icon={<Repeat size={18} />}
            label={`Review${reviewStats?.dueCount ? ` (${reviewStats.dueCount})` : ""}`}
            onClick={() => setPage("review")}
          />
          <NavButton
            active={page === "settings"}
            icon={<Settings size={18} />}
            label="Settings"
            onClick={() => setPage("settings")}
          />
        </nav>
        <div className="mt-auto space-y-3">
          <button
            type="button"
            onClick={() => setDarkMode((v) => !v)}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-ink/10 bg-white px-3 py-2 text-xs font-semibold text-ink/70 transition hover:bg-ink/5 dark:border-white/10 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-white/5"
          >
            {darkMode ? <Sun size={15} /> : <Moon size={15} />}
            {darkMode ? "Light mode" : "Dark mode"}
          </button>
          <div className="rounded-lg border border-ink/10 bg-paper p-3 dark:border-white/10 dark:bg-slate-900">
            <div className="mb-2 flex items-center gap-2 text-sm font-medium">
              {geminiStatus?.installed ? (
                <CheckCircle2 className="text-teal" size={17} />
              ) : (
                <Sparkles className="text-coral" size={17} />
              )}
              Gemini CLI
            </div>
            <p className="text-xs leading-5 text-ink/60 dark:text-slate-400">
              {geminiStatus?.installed ? "Ready for local generation." : "Open Settings to finish setup."}
            </p>
          </div>
        </div>
      </aside>

      <main className="h-screen min-w-0 flex-1 overflow-y-auto" data-testid="content-scroll">
        <div className="mx-auto max-w-7xl px-8 py-7">
          {globalError ? <Alert message={globalError} onClose={() => setGlobalError(null)} /> : null}
          {toast ? <Toast message={toast} onClose={() => setToast(null)} /> : null}
          {page === "home" ? (
            <HomeScreen geminiStatus={geminiStatus} onGenerated={afterGenerate} onError={setGlobalError} />
          ) : null}
          {page === "courses" ? (
            <CoursesScreen courses={courses} onOpen={openCourse} onDeleted={refreshLibrary} onError={setGlobalError} />
          ) : null}
          {page === "course" && selectedCourse ? (
            <CourseScreen
              course={selectedCourse}
              highlightSentenceId={highlightSentenceId}
              onCourseChanged={reloadSelectedCourse}
              onError={setGlobalError}
              onToast={setToast}
            />
          ) : null}
          {page === "vocabulary" ? (
            <VocabularyScreen vocabulary={vocabulary} onOpenCourse={openCourse} onRefresh={refreshLibrary} />
          ) : null}
          {page === "review" ? (
            <ReviewScreen onRefreshStats={refreshLibrary} onError={setGlobalError} />
          ) : null}
          {page === "settings" ? (
            <SettingsScreen status={geminiStatus} onRefresh={() => window.newsEnglish.system.checkGemini().then(setGeminiStatus)} />
          ) : null}
        </div>
      </main>
    </div>
  );
}

function NavButton({
  active,
  icon,
  label,
  onClick
}: {
  active: boolean;
  icon: ReactNode;
  label: string;
  onClick: () => void;
}): ReactElement {
  return (
    <button
      className={`flex h-11 w-full items-center gap-3 rounded-lg px-3 text-left text-sm font-medium transition ${
        active
          ? "bg-ink text-white shadow-panel dark:bg-white/10"
          : "text-ink/70 hover:bg-ink/5 hover:text-ink dark:text-slate-300 dark:hover:bg-white/5 dark:hover:text-white"
      }`}
      onClick={onClick}
      type="button"
    >
      {icon}
      {label}
    </button>
  );
}

type GeneratePhase =
  | { kind: "idle" }
  | { kind: "crawling" }
  | { kind: "crawled"; article: ArticleExtraction }
  | { kind: "crawl_failed"; message: string }
  | { kind: "generating"; crawled: ArticleExtraction | null };

function HomeScreen({
  geminiStatus,
  onGenerated,
  onError
}: {
  geminiStatus: GeminiStatus | null;
  onGenerated: (course: StoredCourse) => Promise<void>;
  onError: (message: string) => void;
}): ReactElement {
  const [input, setInput] = useState("");
  const [level, setLevel] = useState<CourseLevel>("B1-B2");
  const [phase, setPhase] = useState<GeneratePhase>({ kind: "idle" });
  const [progress, setProgress] = useState<GenerationProgress>(initialProgress);
  const trimmed = input.trim();
  const looksLikeUrl = /^https?:\/\//i.test(trimmed);
  const canGenerate = trimmed.length > 20 || looksLikeUrl;
  const isBusy = phase.kind === "crawling" || phase.kind === "generating";

  useEffect(() => {
    const unsubscribe = window.newsEnglish.system.onCourseProgress((event) => {
      setProgress((prev) => applyProgress(prev, event));
    });
    return () => {
      unsubscribe();
    };
  }, []);

  const resetToIdle = (): void => {
    setPhase({ kind: "idle" });
  };

  const startCrawl = async (): Promise<void> => {
    if (!looksLikeUrl) return;
    onError("");
    setPhase({ kind: "crawling" });
    try {
      const article = await window.newsEnglish.course.crawl(trimmed);
      if (article) {
        setPhase({ kind: "crawled", article });
      } else {
        setPhase({ kind: "crawl_failed", message: "Couldn't fetch this URL." });
      }
    } catch (error) {
      setPhase({ kind: "crawl_failed", message: toMessage(error) });
    }
  };

  const runGenerate = async (payload: GenerateCourseInput, crawled: ArticleExtraction | null): Promise<void> => {
    onError("");
    setProgress(initialProgress);
    setPhase({ kind: "generating", crawled });
    try {
      const course = await window.newsEnglish.course.generate(payload);
      await onGenerated(course);
      setInput("");
      setPhase({ kind: "idle" });
    } catch (error) {
      onError(toMessage(error));
      setPhase({ kind: "idle" });
    }
  };

  const continueGenerate = async (): Promise<void> => {
    if (phase.kind === "crawled") {
      const article = phase.article;
      await runGenerate({ text: `${article.title}\n\n${article.text}`, level }, article);
      return;
    }
    if (!looksLikeUrl) {
      await runGenerate({ text: trimmed, level }, null);
    }
  };

  const primaryAction = (): void => {
    if (phase.kind === "crawled") {
      void continueGenerate();
      return;
    }
    if (phase.kind === "crawl_failed") {
      void startCrawl();
      return;
    }
    if (looksLikeUrl) {
      void startCrawl();
      return;
    }
    void continueGenerate();
  };

  const primaryLabel =
    phase.kind === "crawling"
      ? "Crawling"
      : phase.kind === "generating"
        ? "Generating"
        : phase.kind === "crawled"
          ? "Continue"
          : phase.kind === "crawl_failed"
            ? "Retry"
            : looksLikeUrl
              ? "Crawl"
              : "Generate";

  const handleInputChange = (value: string): void => {
    setInput(value);
    if (phase.kind === "crawled" || phase.kind === "crawl_failed") {
      setPhase({ kind: "idle" });
    }
  };

  return (
    <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div>
        <Header eyebrow="Course Generator" title="Turn a news article into a Khmer-supported English lesson." />
        <div className="mt-6 rounded-lg border border-ink/10 bg-white p-5 shadow-panel dark:border-white/10 dark:bg-slate-900">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <label className="text-sm font-semibold" htmlFor="article-input">
                News article or URL
              </label>
              <p className="mt-1 text-sm text-ink/55 dark:text-slate-400">Paste full article text or an article link.</p>
            </div>
            <select
              className="h-10 rounded-lg border border-ink/15 bg-white px-3 text-sm font-medium dark:border-white/10 dark:bg-slate-800"
              value={level}
              onChange={(event) => setLevel(event.target.value as CourseLevel)}
            >
              {levels.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </div>
          <textarea
            id="article-input"
            className="min-h-80 w-full resize-none rounded-lg border border-ink/15 bg-paper p-4 text-sm leading-6 text-ink placeholder:text-ink/35 disabled:cursor-not-allowed disabled:opacity-70 dark:border-white/10 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500"
            placeholder="Paste a news article, or enter https://..."
            value={input}
            onChange={(event) => handleInputChange(event.target.value)}
            readOnly={isBusy}
          />
          <div className="mt-4 flex items-center justify-between gap-4">
            <p className="text-sm text-ink/55 dark:text-slate-400">
              {looksLikeUrl ? "URL mode" : `${trimmed.length.toLocaleString()} characters`}
            </p>
            <div className="flex items-center gap-2">
              {phase.kind === "crawled" ? (
                <button
                  className="inline-flex h-11 items-center gap-2 rounded-lg border border-ink/15 bg-white px-4 text-sm font-semibold text-ink/75 transition hover:bg-ink/5 dark:border-white/10 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-white/5"
                  onClick={resetToIdle}
                  type="button"
                >
                  Back
                </button>
              ) : null}
              <button
                className="inline-flex h-11 items-center gap-2 rounded-lg bg-teal px-5 text-sm font-semibold text-white shadow-panel transition hover:bg-teal/90 disabled:cursor-not-allowed disabled:bg-ink/25"
                disabled={!canGenerate || isBusy || geminiStatus?.installed === false}
                onClick={primaryAction}
                type="button"
              >
                {isBusy ? <Loader2 className="animate-spin" size={18} /> : <Wand2 size={18} />}
                {primaryLabel}
              </button>
            </div>
          </div>
          {phase.kind === "crawling" ? (
            <p className="mt-5 inline-flex items-center gap-2 text-sm text-ink/60 dark:text-slate-400">
              <Loader2 className="animate-spin" size={16} /> Fetching article…
            </p>
          ) : null}
          {phase.kind === "crawl_failed" ? (
            <p className="mt-5 inline-flex items-center gap-2 rounded-lg border border-coral/30 bg-coral/10 px-3 py-2 text-sm text-coral">
              {phase.message || "Couldn't fetch this URL."}
            </p>
          ) : null}
          {phase.kind === "crawled" ? <CrawlLog crawled={phase.article} /> : null}
          {phase.kind === "generating" && phase.crawled ? <CrawlLog crawled={phase.crawled} /> : null}
          {phase.kind === "generating" ? <ProgressChecklist progress={progress} /> : null}
        </div>
      </div>
      <aside className="space-y-4">
        <InfoPanel title="Course output" icon={<FileText size={18} />}>
          Sentence translations, Khmer grammar, IPA, collocations, idioms, varied exercises, and writing prompts.
        </InfoPanel>
        <InfoPanel title="Local library" icon={<BookOpen size={18} />}>
          Courses, vocabulary, and your review history are saved to SQLite on this computer.
        </InfoPanel>
        <InfoPanel title="Gemini status" icon={<Sparkles size={18} />}>
          {geminiStatus?.installed ? geminiStatus.path ?? "Gemini CLI found." : geminiStatus?.error ?? "Checking Gemini CLI."}
        </InfoPanel>
      </aside>
    </section>
  );
}

type StepState = "pending" | "active" | "done";

type GenerationProgress = {
  meta: { state: StepState; index?: number; total?: number };
  sentences: { state: StepState; index: number; total: number; failed: number };
  exercises: StepState;
};

const initialProgress: GenerationProgress = {
  meta: { state: "active" },
  sentences: { state: "pending", index: 0, total: 0, failed: 0 },
  exercises: "pending"
};

function applyProgress(prev: GenerationProgress, event: CourseProgressEvent): GenerationProgress {
  if (event.step === "meta") {
    return {
      ...prev,
      meta: { state: event.state === "done" ? "done" : "active", index: event.index, total: event.total }
    };
  }
  if (event.step === "sentences") {
    const done = event.total > 0 && event.index >= event.total;
    return {
      ...prev,
      meta: { state: "done" },
      sentences: {
        state: done ? "done" : "active",
        index: event.index,
        total: event.total,
        failed: event.failed
      }
    };
  }
  if (event.step === "exercises") {
    return {
      ...prev,
      meta: { state: "done" },
      sentences: { ...prev.sentences, state: "done" },
      exercises: event.state === "done" ? "done" : "active"
    };
  }
  if (event.step === "done") {
    return {
      meta: { state: "done" },
      sentences: { ...prev.sentences, state: "done" },
      exercises: "done"
    };
  }
  return prev;
}

function ProgressChecklist({ progress }: { progress: GenerationProgress }): ReactElement {
  return (
    <div className="mt-5 space-y-2 rounded-lg border border-ink/10 bg-paper p-4 text-sm dark:border-white/10 dark:bg-slate-800">
      <ProgressStep
        state={progress.meta.state}
        label="Course outline"
        detail={progress.meta.total ? `${progress.meta.index ?? 0} / ${progress.meta.total}` : undefined}
      />
      <ProgressStep
        state={progress.sentences.state}
        label="Sentences"
        detail={
          progress.sentences.total > 0
            ? `${progress.sentences.index} / ${progress.sentences.total}${progress.sentences.failed > 0 ? ` · ${progress.sentences.failed} failed` : ""}`
            : undefined
        }
      />
      <ProgressStep state={progress.exercises} label="Exercises" />
    </div>
  );
}

function ProgressStep({ state, label, detail }: { state: StepState; label: string; detail?: string }): ReactElement {
  return (
    <div className="flex items-center gap-3">
      <span
        className={`grid h-6 w-6 place-items-center rounded-full text-xs font-bold ${
          state === "done"
            ? "bg-teal text-white"
            : state === "active"
              ? "bg-gold/30 text-ink dark:text-slate-100"
              : "bg-ink/10 text-ink/45 dark:bg-white/5 dark:text-slate-500"
        }`}
      >
        {state === "done" ? <CheckCircle2 size={14} /> : state === "active" ? <Loader2 className="animate-spin" size={13} /> : ""}
      </span>
      <span className={`flex-1 ${state === "pending" ? "text-ink/50 dark:text-slate-500" : ""}`}>{label}</span>
      {detail ? <span className="text-xs text-ink/55 dark:text-slate-400">{detail}</span> : null}
    </div>
  );
}

function GenerationSkeleton(): ReactElement {
  return (
    <div className="mt-5 space-y-3" aria-hidden>
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-4 w-full animate-pulse rounded bg-ink/10 dark:bg-white/10" style={{ width: `${90 - i * 10}%` }} />
      ))}
    </div>
  );
}

function CrawlLog({ crawled }: { crawled: ArticleExtraction }): ReactElement {
  const paragraphs = crawled.text.split(/\n{2,}/).filter((p) => p.trim().length > 0);
  return (
    <details
      open
      className="mt-5 rounded-lg border border-ink/10 bg-paper p-4 text-sm dark:border-white/10 dark:bg-slate-800"
    >
      <summary className="cursor-pointer font-semibold">
        Crawled article — {crawled.title}
        <span className="ml-2 text-xs font-normal text-ink/55 dark:text-slate-400">
          {paragraphs.length} paragraphs · {crawled.text.length.toLocaleString()} chars
        </span>
      </summary>
      <div className="mt-3 max-h-80 space-y-3 overflow-y-auto pr-2 leading-6 text-ink/80 dark:text-slate-300">
        {paragraphs.map((p, i) => (
          <p key={i}>{p}</p>
        ))}
      </div>
    </details>
  );
}

function CoursesScreen({
  courses,
  onOpen,
  onDeleted,
  onError
}: {
  courses: CourseSummary[];
  onOpen: (id: string) => Promise<void>;
  onDeleted: () => Promise<void>;
  onError: (message: string) => void;
}): ReactElement {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return courses;
    return courses.filter((course) => `${course.title} ${course.summary}`.toLowerCase().includes(term));
  }, [courses, query]);

  const deleteCourse = async (id: string): Promise<void> => {
    try {
      await window.newsEnglish.course.delete(id);
      await onDeleted();
    } catch (error) {
      onError(toMessage(error));
    }
  };

  return (
    <section>
      <Header eyebrow="Library" title="Generated courses" />
      <SearchBox value={query} onChange={setQuery} placeholder="Search courses" />
      <div className="mt-5 grid gap-4 xl:grid-cols-2">
        {filtered.map((course) => (
          <article key={course.id} className="rounded-lg border border-ink/10 bg-white p-5 shadow-panel dark:border-white/10 dark:bg-slate-900">
            <div className="mb-3 flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-teal">{course.level}</p>
                <h2 className="mt-1 text-xl font-semibold">{course.title}</h2>
              </div>
              <button
                aria-label={`Delete ${course.title}`}
                className="grid h-9 w-9 place-items-center rounded-lg text-ink/45 transition hover:bg-coral/10 hover:text-coral"
                onClick={() => deleteCourse(course.id)}
                type="button"
              >
                <Trash2 size={17} />
              </button>
            </div>
            <p className="line-clamp-3 text-sm leading-6 text-ink/65 dark:text-slate-300">{course.summary}</p>
            <div className="mt-5 flex items-center justify-between gap-3">
              <div className="flex flex-wrap gap-2 text-xs text-ink/60">
                <Badge>{course.sourceType}</Badge>
                <Badge>{course.vocabularyCount} words</Badge>
                <Badge>{new Date(course.createdAt).toLocaleDateString()}</Badge>
              </div>
              <button
                className="inline-flex h-10 items-center gap-2 rounded-lg bg-ink px-4 text-sm font-semibold text-white dark:bg-white/10"
                onClick={() => onOpen(course.id)}
                type="button"
              >
                View <ChevronRight size={16} />
              </button>
            </div>
          </article>
        ))}
      </div>
      {!filtered.length ? <EmptyState title="No courses yet" detail="Generate a course from the Home screen." /> : null}
    </section>
  );
}

function CourseScreen({
  course,
  highlightSentenceId,
  onCourseChanged,
  onError,
  onToast
}: {
  course: StoredCourse;
  highlightSentenceId: string | null;
  onCourseChanged: () => Promise<void>;
  onError: (message: string) => void;
  onToast: (message: string) => void;
}): ReactElement {
  const [localHighlightSentenceId, setLocalHighlightSentenceId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [regenType, setRegenType] = useState<ExerciseType>("matching");
  const courseVocabulary = useMemo(
    () =>
      course.sentences.flatMap((sentence, index) =>
        sentence.vocabulary.map((item) => ({
          ...item,
          sentenceNumber: index + 1,
          sourceSentenceId: sentence.id
        }))
      ),
    [course.sentences]
  );

  useEffect(() => {
    if (!highlightSentenceId) return;
    document.getElementById(`sentence-${highlightSentenceId}`)?.scrollIntoView({ block: "center", behavior: "smooth" });
    setLocalHighlightSentenceId(highlightSentenceId);
  }, [highlightSentenceId, course.id]);

  // Keyboard nav: j/k between sentences, space to TTS focused sentence, b to bookmark vocab.
  useEffect(() => {
    const handler = (event: KeyboardEvent): void => {
      if (event.target instanceof HTMLElement) {
        const tag = event.target.tagName;
        if (["INPUT", "TEXTAREA", "SELECT"].includes(tag) || event.target.isContentEditable) return;
      }
      const sentences = course.sentences;
      if (!sentences.length) return;
      const currentIdx = sentences.findIndex((s) => s.id === localHighlightSentenceId);
      const moveTo = (idx: number): void => {
        const target = sentences[Math.max(0, Math.min(sentences.length - 1, idx))];
        if (!target) return;
        setLocalHighlightSentenceId(target.id);
        document.getElementById(`sentence-${target.id}`)?.scrollIntoView({ block: "center", behavior: "smooth" });
      };
      if (event.key === "j") {
        event.preventDefault();
        moveTo(currentIdx === -1 ? 0 : currentIdx + 1);
      } else if (event.key === "k") {
        event.preventDefault();
        moveTo(currentIdx === -1 ? 0 : currentIdx - 1);
      } else if (event.key === " " || event.code === "Space") {
        const target = sentences[currentIdx === -1 ? 0 : currentIdx];
        if (!target) return;
        event.preventDefault();
        speak(target.english);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [course.sentences, localHighlightSentenceId]);

  const toggleVocabulary = async (item: StoredVocabulary): Promise<void> => {
    try {
      await window.newsEnglish.vocabulary.setBookmarked(item.id, !item.isBookmarked);
      await onCourseChanged();
    } catch (error) {
      onToast(toMessage(error));
    }
  };

  const scrollToSentence = (sentenceId: string): void => {
    setLocalHighlightSentenceId(sentenceId);
    document.getElementById(`sentence-${sentenceId}`)?.scrollIntoView({ block: "center", behavior: "smooth" });
  };

  const regenerate = async (): Promise<void> => {
    setBusy("regen");
    try {
      await window.newsEnglish.course.regenerateExercises(course.id, regenType, 3, false);
      await onCourseChanged();
      onToast(`Added 3 ${regenType} exercises.`);
    } catch (error) {
      onError(toMessage(error));
    } finally {
      setBusy(null);
    }
  };

  const simplify = async (sentence: StoredSentence): Promise<void> => {
    setBusy(`simplify-${sentence.id}`);
    try {
      await window.newsEnglish.sentence.simplify(sentence.id, course.level);
      await onCourseChanged();
    } catch (error) {
      onError(toMessage(error));
    } finally {
      setBusy(null);
    }
  };

  const retryEnrich = async (sentence: StoredSentence): Promise<void> => {
    setBusy(`enrich-${sentence.id}`);
    try {
      await window.newsEnglish.sentence.enrich(sentence.id);
      await onCourseChanged();
    } catch (error) {
      onError(toMessage(error));
    } finally {
      setBusy(null);
    }
  };

  const deepen = async (word: StoredVocabulary): Promise<void> => {
    setBusy(`deepen-${word.id}`);
    try {
      await window.newsEnglish.vocabulary.deepen(word.id);
      await onCourseChanged();
    } catch (error) {
      onError(toMessage(error));
    } finally {
      setBusy(null);
    }
  };

  const exportAnki = async (): Promise<void> => {
    try {
      const result = await window.newsEnglish.course.exportAnki(course.id);
      if (result.ok) onToast(`Exported to ${result.path}`);
    } catch (error) {
      onError(toMessage(error));
    }
  };
  const exportMarkdown = async (): Promise<void> => {
    try {
      const result = await window.newsEnglish.course.exportMarkdown(course.id);
      if (result.ok) onToast(`Exported to ${result.path}`);
    } catch (error) {
      onError(toMessage(error));
    }
  };

  return (
    <article>
      <div className="rounded-lg bg-ink p-6 text-white shadow-panel dark:bg-slate-900">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-white/60">{course.level}</p>
            <h1 className="mt-2 max-w-4xl text-3xl font-semibold">{course.title}</h1>
            <p className="mt-3 max-w-4xl text-sm leading-6 text-white/70">{course.summary}</p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <Badge dark>{new Date(course.createdAt).toLocaleString()}</Badge>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={exportMarkdown}
                className="inline-flex h-9 items-center gap-2 rounded-lg bg-white/10 px-3 text-xs font-semibold text-white hover:bg-white/20"
              >
                <Download size={14} /> Markdown
              </button>
              <button
                type="button"
                onClick={exportAnki}
                className="inline-flex h-9 items-center gap-2 rounded-lg bg-white/10 px-3 text-xs font-semibold text-white hover:bg-white/20"
              >
                <Download size={14} /> Anki TSV
              </button>
            </div>
          </div>
        </div>
      </div>

      <OriginalArticle course={course} />

      <section className="mt-6 grid gap-4 lg:grid-cols-3">
        <InfoPanel title="Key ideas" icon={<Sparkles size={18} />}>
          <ul className="space-y-2">
            {course.keyIdeas.map((idea) => (
              <li key={idea}>{idea}</li>
            ))}
          </ul>
        </InfoPanel>
        <InfoPanel title="Grammar focus" icon={<GraduationCap size={18} />}>
          {course.grammarFocus}
        </InfoPanel>
        <InfoPanel title="Tense overview" icon={<FileText size={18} />}>
          {course.tenseOverview}
        </InfoPanel>
      </section>

      {course.discussionQuestions?.length || course.writingPrompt ? (
        <section className="mt-6 grid gap-4 lg:grid-cols-2">
          {course.discussionQuestions?.length ? (
            <InfoPanel title="Discussion" icon={<HelpCircle size={18} />}>
              <ul className="space-y-2 list-disc pl-5">
                {course.discussionQuestions.map((q) => (
                  <li key={q}>{q}</li>
                ))}
              </ul>
            </InfoPanel>
          ) : null}
          {course.writingPrompt ? (
            <InfoPanel title="Writing prompt" icon={<FileText size={18} />}>
              {course.writingPrompt}
            </InfoPanel>
          ) : null}
        </section>
      ) : null}

      <section className="mt-6 rounded-lg border border-ink/10 bg-white shadow-panel dark:border-white/10 dark:bg-slate-900">
        <div className="border-b border-ink/10 px-5 py-4 dark:border-white/10">
          <h2 className="text-lg font-semibold">Sentence study</h2>
          <p className="mt-1 text-xs text-ink/55 dark:text-slate-400">
            Shortcuts: <kbd className="rounded bg-ink/5 px-1 dark:bg-white/10">j</kbd>/<kbd className="rounded bg-ink/5 px-1 dark:bg-white/10">k</kbd> next/prev,{" "}
            <kbd className="rounded bg-ink/5 px-1 dark:bg-white/10">space</kbd> speak
          </p>
        </div>
        <div className="divide-y divide-ink/10 dark:divide-white/10">
          {course.sentences.map((sentence, index) => (
            <div
              id={`sentence-${sentence.id}`}
              key={sentence.id}
              className={`grid gap-4 p-5 transition lg:grid-cols-[42px_minmax(0,1fr)_minmax(280px,36%)] ${
                localHighlightSentenceId === sentence.id ? "bg-gold/10 dark:bg-gold/5" : "bg-white dark:bg-slate-900"
              }`}
            >
              <div className="grid h-9 w-9 place-items-center rounded-lg bg-paper text-sm font-semibold text-ink/60 dark:bg-white/5 dark:text-slate-300">
                {index + 1}
              </div>
              {sentence.enrichmentFailed ? (
                <div className="lg:col-span-2">
                  <p className="text-base font-semibold leading-7">{sentence.english}</p>
                  <div className="mt-3 flex flex-wrap items-center gap-3 rounded-lg border border-coral/30 bg-coral/10 p-3 text-sm text-coral">
                    <span>This sentence couldn't be enriched during generation.</span>
                    <button
                      type="button"
                      onClick={() => retryEnrich(sentence)}
                      disabled={busy === `enrich-${sentence.id}`}
                      className="inline-flex h-8 items-center gap-2 rounded-lg bg-coral px-3 text-xs font-semibold text-white disabled:opacity-60"
                    >
                      {busy === `enrich-${sentence.id}` ? <Loader2 className="animate-spin" size={12} /> : <Zap size={12} />}
                      Retry
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div>
                    <div className="flex items-start gap-2">
                      <p className="text-base font-semibold leading-7 flex-1">{sentence.english}</p>
                      <SpeakButton text={sentence.english} />
                    </div>
                    {sentence.simplifiedEnglish ? (
                      <p className="mt-1 text-sm italic text-ink/60 dark:text-slate-400">
                        Simplified: {sentence.simplifiedEnglish}
                      </p>
                    ) : null}
                    {sentence.pronunciationIpa ? (
                      <p className="mt-1 text-xs text-ink/45 dark:text-slate-500">{sentence.pronunciationIpa}</p>
                    ) : null}
                    <p className="khmer-text mt-2 text-base text-ink/75 dark:text-slate-300">{sentence.khmer}</p>

                    {sentence.collocations?.length ? (
                      <p className="mt-2 text-xs text-ink/60 dark:text-slate-400">
                        <span className="font-semibold">Collocations:</span> {sentence.collocations.join(", ")}
                      </p>
                    ) : null}
                    {sentence.phrasalVerbs?.length ? (
                      <div className="mt-2 space-y-1 text-xs">
                        {sentence.phrasalVerbs.map((p) => (
                          <p key={p.phrase}>
                            <span className="font-semibold">{p.phrase}</span> — {p.meaningEn}{" "}
                            <span className="khmer-text text-ink/60 dark:text-slate-400">({p.khmer})</span>
                          </p>
                        ))}
                      </div>
                    ) : null}
                    {sentence.idioms?.length ? (
                      <div className="mt-2 space-y-1 text-xs">
                        {sentence.idioms.map((i) => (
                          <p key={i.phrase}>
                            <span className="font-semibold italic">{i.phrase}</span> — {i.meaningEn}{" "}
                            <span className="khmer-text text-ink/60 dark:text-slate-400">({i.khmer})</span>
                          </p>
                        ))}
                      </div>
                    ) : null}

                    <div className="mt-3 flex flex-wrap gap-2">
                      {sentence.vocabulary.map((item) => (
                        <button
                          key={item.id}
                          className={`rounded-lg border px-3 py-1.5 text-xs font-semibold ${
                            item.isBookmarked
                              ? "border-teal/30 bg-teal/10 text-teal"
                              : "border-ink/10 bg-paper text-ink/60 dark:border-white/10 dark:bg-white/5 dark:text-slate-300"
                          }`}
                          onClick={async () => {
                            await toggleVocabulary(item);
                          }}
                          type="button"
                          title={item.khmer}
                        >
                          {item.word}
                        </button>
                      ))}
                    </div>
                    {!sentence.simplifiedEnglish ? (
                      <button
                        type="button"
                        onClick={() => simplify(sentence)}
                        disabled={busy === `simplify-${sentence.id}`}
                        className="mt-3 inline-flex items-center gap-2 text-xs font-semibold text-teal hover:underline disabled:opacity-50"
                      >
                        {busy === `simplify-${sentence.id}` ? <Loader2 className="animate-spin" size={12} /> : <Zap size={12} />}
                        Simplify
                      </button>
                    ) : null}
                  </div>
                  <GrammarPanel
                    sentence={sentence}
                    courseSummary={course.summary}
                    onError={onError}
                  />
                </>
              )}
            </div>
          ))}
        </div>
      </section>

      <section className="mt-6 rounded-lg border border-ink/10 bg-white shadow-panel dark:border-white/10 dark:bg-slate-900">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink/10 px-5 py-4 dark:border-white/10">
          <div>
            <h2 className="text-lg font-semibold">Vocabulary</h2>
            <p className="mt-1 text-sm text-ink/55 dark:text-slate-400">{courseVocabulary.length} words from this course</p>
          </div>
          <Badge>{course.vocabularyCount} saved</Badge>
        </div>
        {courseVocabulary.length ? (
          <div className="grid gap-4 p-5 xl:grid-cols-2">
            {courseVocabulary.map((item) => (
              <article key={item.id} className="rounded-lg border border-ink/10 bg-paper p-4 dark:border-white/10 dark:bg-white/5">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-xl font-semibold">{item.word}</h3>
                      <SpeakButton text={item.word} small />
                      <Badge>{item.partOfSpeech}</Badge>
                      {item.cefrLevel ? <Badge>{item.cefrLevel}</Badge> : null}
                      {item.frequency ? <Badge>{item.frequency}</Badge> : null}
                    </div>
                    {item.ipa ? (
                      <p className="mt-1 text-xs text-ink/45 dark:text-slate-500">{item.ipa}</p>
                    ) : null}
                    <p className="khmer-text mt-1 text-sm font-semibold text-teal">{item.khmer}</p>
                  </div>
                  <button
                    aria-label={`${item.isBookmarked ? "Remove" : "Add"} ${item.word} bookmark`}
                    className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg transition ${
                      item.isBookmarked ? "bg-gold/15 text-gold" : "bg-white text-ink/40 hover:text-gold dark:bg-white/5 dark:text-slate-400"
                    }`}
                    onClick={() => toggleVocabulary(item)}
                    type="button"
                  >
                    <Star size={17} fill={item.isBookmarked ? "currentColor" : "none"} />
                  </button>
                </div>
                <p className="mt-3 text-sm leading-6 text-ink/65 dark:text-slate-300">{item.definitionEn}</p>
                {item.synonyms?.length ? (
                  <p className="mt-2 text-xs text-ink/55 dark:text-slate-400">
                    <span className="font-semibold">Synonyms:</span> {item.synonyms.join(", ")}
                  </p>
                ) : null}
                {item.antonyms?.length ? (
                  <p className="mt-1 text-xs text-ink/55 dark:text-slate-400">
                    <span className="font-semibold">Antonyms:</span> {item.antonyms.join(", ")}
                  </p>
                ) : null}
                {item.collocations?.length ? (
                  <p className="mt-1 text-xs text-ink/55 dark:text-slate-400">
                    <span className="font-semibold">Collocations:</span> {item.collocations.join(", ")}
                  </p>
                ) : null}
                <div className="mt-4 rounded-lg bg-white p-3 text-sm leading-6 dark:bg-slate-900">
                  <p className="font-medium">{item.exampleEn}</p>
                  <p className="khmer-text mt-1 text-ink/65 dark:text-slate-400">{item.exampleKm}</p>
                </div>
                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <button
                    className="inline-flex items-center gap-2 text-sm font-semibold text-teal"
                    onClick={() => scrollToSentence(item.sourceSentenceId)}
                    type="button"
                  >
                    Sentence {item.sentenceNumber} <ChevronRight size={15} />
                  </button>
                  <button
                    type="button"
                    onClick={() => deepen(item)}
                    disabled={busy === `deepen-${item.id}`}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-ink/60 hover:text-teal disabled:opacity-50 dark:text-slate-400"
                  >
                    {busy === `deepen-${item.id}` ? <Loader2 className="animate-spin" size={12} /> : <Zap size={12} />}
                    Deepen
                  </button>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="p-5">
            <EmptyState title="No vocabulary in this course" detail="Generate again with a richer article to extract words." />
          </div>
        )}
      </section>

      <section className="mt-6 rounded-lg border border-ink/10 bg-white shadow-panel dark:border-white/10 dark:bg-slate-900">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink/10 px-5 py-4 dark:border-white/10">
          <h2 className="text-lg font-semibold">Exercises</h2>
          <div className="flex items-center gap-2">
            <select
              className="h-9 rounded-lg border border-ink/15 bg-white px-2 text-xs font-medium dark:border-white/10 dark:bg-slate-800"
              value={regenType}
              onChange={(e) => setRegenType(e.target.value as ExerciseType)}
            >
              {exerciseTypes.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={regenerate}
              disabled={busy === "regen"}
              className="inline-flex h-9 items-center gap-2 rounded-lg bg-teal px-3 text-xs font-semibold text-white disabled:opacity-50"
            >
              {busy === "regen" ? <Loader2 className="animate-spin" size={13} /> : <Sparkles size={13} />}
              Add 3
            </button>
          </div>
        </div>
        <div className="grid gap-4 p-5 lg:grid-cols-2">
          {course.exercises.map((exercise) => (
            <div key={exercise.id} className="rounded-lg border border-ink/10 bg-paper p-5 dark:border-white/10 dark:bg-white/5">
              <Badge>{exercise.type}</Badge>
              <h3 className="mt-3 text-base font-semibold">{exercise.prompt}</h3>
              {exercise.choices.length ? (
                <div className="mt-3 grid gap-2">
                  {exercise.choices.map((choice) => (
                    <div
                      className={`rounded-lg border px-3 py-2 text-sm ${
                        choice === exercise.answer
                          ? "border-teal/40 bg-teal/10"
                          : "border-ink/10 bg-white dark:border-white/10 dark:bg-slate-900"
                      }`}
                      key={choice}
                    >
                      {choice}
                    </div>
                  ))}
                </div>
              ) : null}
              {exercise.pairs?.length ? (
                <div className="mt-3 grid gap-1 text-sm">
                  {exercise.pairs.map((pair) => (
                    <p key={`${pair.left}-${pair.right}`}>
                      <span className="font-semibold">{pair.left}</span> → {pair.right}
                    </p>
                  ))}
                </div>
              ) : null}
              {exercise.items?.length ? (
                <p className="mt-3 text-sm text-ink/65 dark:text-slate-300">
                  Items: {exercise.items.join(" / ")}
                </p>
              ) : null}
              <p className="mt-4 text-sm font-semibold">Answer: {exercise.answer}</p>
              <p className="khmer-text mt-2 text-sm text-ink/65 dark:text-slate-400">{exercise.explanationKm}</p>
            </div>
          ))}
        </div>
      </section>
    </article>
  );
}

function GrammarPanel({
  sentence,
  courseSummary,
  onError
}: {
  sentence: StoredSentence;
  courseSummary: string;
  onError: (message: string) => void;
}): ReactElement {
  const [question, setQuestion] = useState("");
  const [asking, setAsking] = useState(false);
  const [answer, setAnswer] = useState<{ answerEn: string; answerKm: string } | null>(null);

  const ask = async (): Promise<void> => {
    const trimmed = question.trim();
    if (!trimmed || asking) return;
    setAsking(true);
    setAnswer(null);
    try {
      const result = await window.newsEnglish.sentence.explain(sentence.id, trimmed);
      setAnswer(result);
    } catch (error) {
      onError(toMessage(error));
    } finally {
      setAsking(false);
    }
  };

  return (
    <div className="rounded-lg bg-paper p-4 dark:bg-white/5">
      <div className="flex flex-wrap items-center gap-2">
        <Badge>{sentence.tense}</Badge>
        <TenseTimelineBadge tense={sentence.tense} />
        {sentence.difficulty ? <Badge>{sentence.difficulty}</Badge> : null}
        {sentence.register ? <Badge>{sentence.register}</Badge> : null}
      </div>
      {sentence.tenseFormula ? (
        <p className="mt-2 font-mono text-xs text-ink/65 dark:text-slate-400">{sentence.tenseFormula}</p>
      ) : null}
      {sentence.structuralBreakdown?.length ? (
        <div className="mt-3 overflow-hidden rounded-lg border border-ink/10 text-xs dark:border-white/10">
          <table className="w-full">
            <tbody className="divide-y divide-ink/10 dark:divide-white/10">
              {sentence.structuralBreakdown.map((part) => (
                <tr key={`${part.part}-${part.english}`}>
                  <td className="bg-white/40 px-2 py-1 font-semibold text-ink/65 dark:bg-white/10 dark:text-slate-300">{part.part}</td>
                  <td className="px-2 py-1">{part.english}</td>
                  <td className="khmer-text px-2 py-1 text-ink/65 dark:text-slate-400">{part.khmer}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      {sentence.verbForms ? <VerbFormsTable forms={sentence.verbForms} /> : null}
      <p className="khmer-text mt-3 text-sm text-ink/70 dark:text-slate-300">{sentence.grammarExplanationKm}</p>
      {sentence.khmerSpeakerPitfallsKm ? (
        <p className="khmer-text mt-3 rounded-lg bg-coral/10 px-3 py-2 text-xs text-coral">
          {sentence.khmerSpeakerPitfallsKm}
        </p>
      ) : null}
      <div className="mt-3 flex items-center gap-2">
        <input
          className="h-9 flex-1 rounded-lg border border-ink/15 bg-white px-2 text-xs outline-none focus:border-teal dark:border-white/10 dark:bg-slate-800"
          placeholder="Ask about this grammar…"
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              ask();
            }
          }}
          disabled={asking}
        />
        <button
          type="button"
          onClick={ask}
          disabled={asking || !question.trim()}
          className="inline-flex h-9 items-center gap-1 rounded-lg bg-teal px-3 text-xs font-semibold text-white disabled:opacity-50"
        >
          {asking ? <Loader2 className="animate-spin" size={12} /> : <Sparkles size={12} />}
          Ask
        </button>
      </div>
      {answer ? (
        <div className="mt-3 space-y-1 rounded-lg bg-white/60 px-3 py-2 text-xs dark:bg-slate-900/60">
          <p>{answer.answerEn}</p>
          <p className="khmer-text text-ink/70 dark:text-slate-400">{answer.answerKm}</p>
        </div>
      ) : null}
    </div>
  );
}

function TenseTimelineBadge({ tense }: { tense: string }): ReactElement | null {
  const t = tense.toLowerCase();
  if (!t || t === "unknown") return null;
  const period = t.includes("future")
    ? { label: "Future", glyph: "→" }
    : t.includes("past")
      ? { label: "Past", glyph: "←" }
      : t.includes("present")
        ? { label: "Present", glyph: "•" }
        : null;
  const aspect = t.includes("perfect continuous")
    ? "perfect cont."
    : t.includes("perfect")
      ? "perfect"
      : t.includes("continuous") || t.includes("progressive")
        ? "continuous"
        : "simple";
  if (!period) return null;
  return (
    <span className="inline-flex h-7 items-center gap-1 rounded-lg bg-ink/5 px-2 text-xs font-semibold text-ink/70 dark:bg-white/10 dark:text-slate-300">
      <span aria-hidden>{period.glyph}</span> {period.label} · {aspect}
    </span>
  );
}

function VerbFormsTable({ forms }: { forms: VerbForms }): ReactElement {
  const cell = (label: string, value: string, key: "v1" | "v2" | "v3"): ReactElement => {
    const active = forms.usedAs === key;
    return (
      <td
        className={`px-2 py-1 ${
          active
            ? "bg-teal/15 font-semibold text-teal"
            : "text-ink/75 dark:text-slate-300"
        }`}
      >
        <div className="text-[10px] uppercase tracking-wide opacity-60">{label}</div>
        <div>{value}</div>
      </td>
    );
  };
  return (
    <div className="mt-3 overflow-hidden rounded-lg border border-ink/10 text-xs dark:border-white/10">
      <table className="w-full">
        <tbody>
          <tr>
            {cell("V1 base", forms.base, "v1")}
            {cell("V2 past", forms.pastSimple, "v2")}
            {cell("V3 p.part", forms.pastParticiple, "v3")}
            {forms.khmer ? (
              <td className="khmer-text px-2 py-1 text-ink/65 dark:text-slate-400">{forms.khmer}</td>
            ) : null}
            {forms.isIrregular ? (
              <td className="px-2 py-1 text-right">
                <span className="inline-flex items-center rounded bg-coral/15 px-1.5 py-0.5 text-[10px] font-semibold text-coral">
                  irregular
                </span>
              </td>
            ) : null}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function OriginalArticle({ course }: { course: StoredCourse }): ReactElement | null {
  const text = course.originalText?.trim();
  if (!text) return null;
  const paragraphs = text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const charCount = text.length.toLocaleString();
  return (
    <details className="mt-6 rounded-lg border border-ink/10 bg-white shadow-panel dark:border-white/10 dark:bg-slate-900">
      <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-3 px-5 py-4">
        <div className="flex items-center gap-2">
          <FileText size={18} className="text-teal" />
          <h2 className="text-lg font-semibold">Original article</h2>
          {course.articleTitle ? (
            <span className="text-sm text-ink/55 dark:text-slate-400">— {course.articleTitle}</span>
          ) : null}
        </div>
        <span className="text-xs text-ink/55 dark:text-slate-400">
          {paragraphs.length} paragraphs · {charCount} chars
        </span>
      </summary>
      <div className="border-t border-ink/10 px-5 py-4 dark:border-white/10">
        {course.sourceType === "url" && course.sourceUrl ? (
          <p className="mb-3 break-all text-xs text-ink/55 dark:text-slate-400">
            Source:{" "}
            <a
              href={course.sourceUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="font-semibold text-teal hover:underline"
            >
              {course.sourceUrl}
            </a>
          </p>
        ) : null}
        <div className="max-h-96 space-y-3 overflow-y-auto pr-2 text-sm leading-7 text-ink/80 dark:text-slate-300">
          {paragraphs.map((p, i) => (
            <p key={i}>{p}</p>
          ))}
        </div>
      </div>
    </details>
  );
}

function VocabularyScreen({
  vocabulary,
  onOpenCourse,
  onRefresh
}: {
  vocabulary: StoredVocabulary[];
  onOpenCourse: (id: string, sentenceId?: string) => Promise<void>;
  onRefresh: () => Promise<void>;
}): ReactElement {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    return vocabulary.filter((item) => {
      const matches = !term || `${item.word} ${item.khmer} ${item.courseTitle}`.toLowerCase().includes(term);
      return item.isBookmarked && matches;
    });
  }, [query, vocabulary]);

  return (
    <section>
      <Header eyebrow="Vocabulary" title="Bookmarked words" />
      <SearchBox value={query} onChange={setQuery} placeholder="Search words, Khmer, or course" />
      <div className="mt-5 grid gap-4 xl:grid-cols-2">
        {filtered.map((item) => (
          <article key={item.id} className="rounded-lg border border-ink/10 bg-white p-5 shadow-panel dark:border-white/10 dark:bg-slate-900">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-2xl font-semibold">{item.word}</p>
                  <SpeakButton text={item.word} small />
                </div>
                <p className="khmer-text mt-1 text-sm font-medium text-teal">{item.khmer}</p>
              </div>
              <button
                aria-label={`Remove ${item.word} bookmark`}
                className="grid h-9 w-9 place-items-center rounded-lg bg-gold/15 text-gold"
                onClick={async () => {
                  await window.newsEnglish.vocabulary.setBookmarked(item.id, false);
                  await onRefresh();
                }}
                type="button"
              >
                <Star size={17} fill="currentColor" />
              </button>
            </div>
            <Badge>{item.partOfSpeech}</Badge>
            <p className="mt-3 text-sm leading-6 text-ink/65 dark:text-slate-300">{item.definitionEn}</p>
            <div className="mt-4 rounded-lg bg-paper p-3 text-sm leading-6 dark:bg-white/5">
              <p className="font-medium">{item.exampleEn}</p>
              <p className="khmer-text mt-1 text-ink/65 dark:text-slate-400">{item.exampleKm}</p>
            </div>
            <button
              className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-teal"
              onClick={() => onOpenCourse(item.courseId, item.sentenceId ?? undefined)}
              type="button"
            >
              {item.courseTitle} <ChevronRight size={15} />
            </button>
          </article>
        ))}
      </div>
      {!filtered.length ? <EmptyState title="No bookmarked words" detail="Vocabulary appears after course generation." /> : null}
    </section>
  );
}

function ReviewScreen({
  onRefreshStats,
  onError
}: {
  onRefreshStats: () => Promise<void>;
  onError: (message: string) => void;
}): ReactElement {
  const [cards, setCards] = useState<ReviewCard[]>([]);
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    try {
      const due = await window.newsEnglish.review.due();
      setCards(due);
      setIndex(0);
      setRevealed(false);
    } catch (error) {
      onError(toMessage(error));
    } finally {
      setLoading(false);
    }
  }, [onError]);

  useEffect(() => {
    load();
  }, [load]);

  const current = cards[index];

  const grade = async (g: ReviewGrade): Promise<void> => {
    if (!current) return;
    try {
      await window.newsEnglish.review.grade(current.id, g);
      const next = index + 1;
      if (next >= cards.length) {
        await onRefreshStats();
        await load();
      } else {
        setIndex(next);
        setRevealed(false);
      }
    } catch (error) {
      onError(toMessage(error));
    }
  };

  if (loading) {
    return (
      <section>
        <Header eyebrow="Review" title="Spaced repetition" />
        <div className="mt-6 grid place-items-center rounded-lg border border-ink/10 bg-white p-10 dark:border-white/10 dark:bg-slate-900">
          <Loader2 className="animate-spin text-teal" />
        </div>
      </section>
    );
  }

  if (!cards.length || !current) {
    return (
      <section>
        <Header eyebrow="Review" title="Spaced repetition" />
        <EmptyState title="No cards due" detail="Bookmark vocabulary from a course to start reviewing." />
      </section>
    );
  }

  return (
    <section>
      <Header eyebrow="Review" title={`Card ${index + 1} of ${cards.length}`} />
      <div className="mt-6 rounded-lg border border-ink/10 bg-white p-8 shadow-panel dark:border-white/10 dark:bg-slate-900">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-wide text-ink/55 dark:text-slate-400">{current.courseTitle}</p>
            <h2 className="mt-2 flex items-center gap-3 text-4xl font-semibold">
              {current.word}
              <SpeakButton text={current.word} />
            </h2>
            <p className="mt-1 text-sm text-ink/55 dark:text-slate-400">{current.partOfSpeech}</p>
          </div>
          <div className="text-right text-xs text-ink/55 dark:text-slate-400">
            <p>interval: {current.intervalDays}d</p>
            <p>ease: {current.easeFactor.toFixed(2)}</p>
          </div>
        </div>
        {revealed ? (
          <div className="mt-6 space-y-3">
            <p className="khmer-text text-2xl font-semibold text-teal">{current.khmer}</p>
            <p className="text-sm leading-6 text-ink/70 dark:text-slate-300">{current.definitionEn}</p>
            <div className="rounded-lg bg-paper p-3 text-sm dark:bg-white/5">
              <p className="font-medium">{current.exampleEn}</p>
              <p className="khmer-text mt-1 text-ink/65 dark:text-slate-400">{current.exampleKm}</p>
            </div>
          </div>
        ) : (
          <p className="mt-8 text-sm text-ink/55 dark:text-slate-400">Recall the meaning, then reveal.</p>
        )}
        <div className="mt-8 flex flex-wrap gap-3">
          {!revealed ? (
            <button
              type="button"
              onClick={() => setRevealed(true)}
              className="inline-flex h-11 items-center gap-2 rounded-lg bg-ink px-5 text-sm font-semibold text-white dark:bg-white/10"
            >
              Reveal
            </button>
          ) : (
            (["again", "hard", "good", "easy"] as const).map((g) => (
              <button
                key={g}
                type="button"
                onClick={() => grade(g)}
                className={`inline-flex h-11 min-w-24 items-center justify-center rounded-lg px-4 text-sm font-semibold text-white ${
                  g === "again"
                    ? "bg-coral"
                    : g === "hard"
                      ? "bg-gold"
                      : g === "good"
                        ? "bg-teal"
                        : "bg-moss"
                }`}
              >
                {g}
              </button>
            ))
          )}
        </div>
      </div>
    </section>
  );
}

function SettingsScreen({ status, onRefresh }: { status: GeminiStatus | null; onRefresh: () => Promise<void> }): ReactElement {
  const [checking, setChecking] = useState(false);
  return (
    <section>
      <Header eyebrow="Settings" title="Generation setup" />
      <div className="mt-6 rounded-lg border border-ink/10 bg-white p-5 shadow-panel dark:border-white/10 dark:bg-slate-900">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold">Gemini CLI</h2>
            <p className="mt-1 text-sm text-ink/60 dark:text-slate-400">
              {status?.installed ? "Installed and available to Electron." : "Install or authenticate Gemini CLI to generate courses."}
            </p>
          </div>
          <button
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-ink px-4 text-sm font-semibold text-white dark:bg-white/10"
            onClick={async () => {
              setChecking(true);
              await onRefresh();
              setChecking(false);
            }}
            type="button"
          >
            {checking ? <Loader2 className="animate-spin" size={17} /> : <Sparkles size={17} />}
            Check
          </button>
        </div>
        <dl className="mt-5 grid gap-3 text-sm">
          <StatusRow label="Installed" value={status?.installed ? "Yes" : "No"} />
          <StatusRow label="Path" value={status?.path ?? "Not found"} />
          <StatusRow label="Version" value={status?.version ?? "Unknown"} />
          <StatusRow label="Error" value={status?.error ?? "None"} />
        </dl>
      </div>
    </section>
  );
}

function SpeakButton({ text, small = false }: { text: string; small?: boolean }): ReactElement | null {
  if (typeof window === "undefined" || !window.speechSynthesis) return null;
  const size = small ? 14 : 16;
  return (
    <button
      type="button"
      aria-label={`Speak: ${text}`}
      onClick={(event) => {
        event.stopPropagation();
        speak(text);
      }}
      className={`grid place-items-center rounded-full bg-ink/5 text-ink/65 transition hover:bg-teal hover:text-white dark:bg-white/5 dark:text-slate-300 ${
        small ? "h-7 w-7" : "h-9 w-9"
      }`}
    >
      <Volume2 size={size} />
    </button>
  );
}

function speak(text: string): void {
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "en-US";
  const stored = window.localStorage?.getItem("tts-rate");
  utterance.rate = stored ? Number(stored) : 0.95;
  const enVoice = window.speechSynthesis.getVoices().find((v) => v.lang?.toLowerCase().startsWith("en"));
  if (enVoice) utterance.voice = enVoice;
  window.speechSynthesis.speak(utterance);
}

function Header({ eyebrow, title }: { eyebrow: string; title: string }): ReactElement {
  return (
    <header>
      <p className="text-sm font-semibold uppercase tracking-wide text-coral">{eyebrow}</p>
      <h1 className="mt-2 max-w-4xl text-3xl font-semibold tracking-normal text-ink dark:text-white">{title}</h1>
    </header>
  );
}

function InfoPanel({ title, icon, children }: { title: string; icon: ReactNode; children: ReactNode }): ReactElement {
  return (
    <div className="rounded-lg border border-ink/10 bg-white p-4 shadow-panel dark:border-white/10 dark:bg-slate-900">
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink dark:text-white">
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-paper text-teal dark:bg-white/5">{icon}</span>
        {title}
      </div>
      <div className="text-sm leading-6 text-ink/65 dark:text-slate-300">{children}</div>
    </div>
  );
}

function SearchBox({
  value,
  onChange,
  placeholder
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}): ReactElement {
  return (
    <div className="mt-5 flex h-11 max-w-xl items-center gap-3 rounded-lg border border-ink/10 bg-white px-3 shadow-panel dark:border-white/10 dark:bg-slate-900">
      <Search size={17} className="text-ink/40" />
      <input
        className="min-w-0 flex-1 border-0 bg-transparent text-sm outline-none placeholder:text-ink/35 dark:placeholder:text-slate-500"
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}

function Badge({ children, dark = false }: { children: ReactNode; dark?: boolean }): ReactElement {
  return (
    <span
      className={`inline-flex h-7 items-center rounded-lg px-2.5 text-xs font-semibold ${
        dark ? "bg-white/12 text-white/80" : "bg-moss/10 text-moss"
      }`}
    >
      {children}
    </span>
  );
}

function StatusRow({ label, value }: { label: string; value: string }): ReactElement {
  return (
    <div className="grid gap-3 rounded-lg bg-paper p-3 sm:grid-cols-[120px_minmax(0,1fr)] dark:bg-white/5">
      <dt className="font-semibold text-ink/65 dark:text-slate-400">{label}</dt>
      <dd className="break-all text-ink dark:text-slate-100">{value}</dd>
    </div>
  );
}

function EmptyState({ title, detail }: { title: string; detail: string }): ReactElement {
  return (
    <div className="mt-8 rounded-lg border border-dashed border-ink/20 bg-white/60 p-10 text-center dark:border-white/10 dark:bg-slate-900/50">
      <p className="text-lg font-semibold">{title}</p>
      <p className="mt-2 text-sm text-ink/55 dark:text-slate-400">{detail}</p>
    </div>
  );
}

function Alert({ message, onClose }: { message: string; onClose: () => void }): ReactElement | null {
  if (!message) return null;
  return (
    <div className="mb-5 flex items-start justify-between gap-4 rounded-lg border border-coral/30 bg-coral/10 p-4 text-sm text-coral">
      <p>{message}</p>
      <button className="font-semibold" onClick={onClose} type="button">
        Dismiss
      </button>
    </div>
  );
}

function Toast({ message, onClose }: { message: string; onClose: () => void }): ReactElement {
  useEffect(() => {
    const id = setTimeout(onClose, 3500);
    return () => clearTimeout(id);
  }, [onClose]);
  return (
    <div className="fixed bottom-6 right-6 z-50 rounded-lg bg-ink/90 px-4 py-3 text-sm text-white shadow-panel">
      {message}
    </div>
  );
}

function toMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export default App;
