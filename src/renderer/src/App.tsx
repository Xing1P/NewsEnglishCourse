import {
  BookOpen,
  CheckCircle2,
  ChevronRight,
  FileText,
  GraduationCap,
  Home,
  Loader2,
  Search,
  Settings,
  Sparkles,
  Star,
  Trash2,
  Wand2
} from "lucide-react";
import type { ReactElement, ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import type {
  CourseLevel,
  CourseSummary,
  GenerateCourseInput,
  GeminiStatus,
  StoredCourse,
  StoredVocabulary
} from "../../shared/schemas";

type Page = "home" | "courses" | "vocabulary" | "settings" | "course";

const levels: CourseLevel[] = ["A2-B1", "B1-B2", "B2-C1"];

function App(): ReactElement {
  const [page, setPage] = useState<Page>("home");
  const [courses, setCourses] = useState<CourseSummary[]>([]);
  const [vocabulary, setVocabulary] = useState<StoredVocabulary[]>([]);
  const [selectedCourse, setSelectedCourse] = useState<StoredCourse | null>(null);
  const [highlightSentenceId, setHighlightSentenceId] = useState<string | null>(null);
  const [geminiStatus, setGeminiStatus] = useState<GeminiStatus | null>(null);
  const [globalError, setGlobalError] = useState<string | null>(null);

  const refreshLibrary = async (): Promise<void> => {
    const [courseRows, vocabRows] = await Promise.all([
      window.newsEnglish.course.list(),
      window.newsEnglish.vocabulary.list({ bookmarkedOnly: false })
    ]);
    setCourses(courseRows);
    setVocabulary(vocabRows);
  };

  useEffect(() => {
    refreshLibrary().catch((error) => setGlobalError(toMessage(error)));
    window.newsEnglish.system.checkGemini().then(setGeminiStatus).catch((error) => {
      setGeminiStatus({ installed: false, path: null, version: null, error: toMessage(error) });
    });
  }, []);

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

  const afterGenerate = async (course: StoredCourse): Promise<void> => {
    await refreshLibrary();
    setSelectedCourse(course);
    setPage("course");
  };

  return (
    <div className="flex min-h-screen bg-paper text-ink">
      <aside className="flex w-64 shrink-0 flex-col border-r border-ink/10 bg-white/80 px-4 py-5">
        <div className="mb-8 flex items-center gap-3 px-2">
          <div className="grid h-11 w-11 place-items-center rounded-lg bg-teal text-white shadow-panel">
            <GraduationCap size={23} />
          </div>
          <div>
            <p className="text-base font-semibold leading-tight">News English</p>
            <p className="text-xs text-ink/55">Khmer course builder</p>
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
            active={page === "settings"}
            icon={<Settings size={18} />}
            label="Settings"
            onClick={() => setPage("settings")}
          />
        </nav>
        <div className="mt-auto rounded-lg border border-ink/10 bg-paper p-3">
          <div className="mb-2 flex items-center gap-2 text-sm font-medium">
            {geminiStatus?.installed ? (
              <CheckCircle2 className="text-teal" size={17} />
            ) : (
              <Sparkles className="text-coral" size={17} />
            )}
            Gemini CLI
          </div>
          <p className="text-xs leading-5 text-ink/60">
            {geminiStatus?.installed ? "Ready for local generation." : "Open Settings to finish setup."}
          </p>
        </div>
      </aside>

      <main className="min-w-0 flex-1">
        <div className="mx-auto max-w-7xl px-8 py-7">
          {globalError ? <Alert message={globalError} onClose={() => setGlobalError(null)} /> : null}
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
              onVocabularyChanged={async () => {
                const updated = await window.newsEnglish.course.get(selectedCourse.id);
                if (updated) setSelectedCourse(updated);
                await refreshLibrary();
              }}
            />
          ) : null}
          {page === "vocabulary" ? (
            <VocabularyScreen vocabulary={vocabulary} onOpenCourse={openCourse} onRefresh={refreshLibrary} />
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
        active ? "bg-ink text-white shadow-panel" : "text-ink/70 hover:bg-ink/5 hover:text-ink"
      }`}
      onClick={onClick}
      type="button"
    >
      {icon}
      {label}
    </button>
  );
}

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
  const [isGenerating, setIsGenerating] = useState(false);
  const trimmed = input.trim();
  const looksLikeUrl = /^https?:\/\//i.test(trimmed);
  const canGenerate = trimmed.length > 20 || looksLikeUrl;

  const generate = async (): Promise<void> => {
    if (!canGenerate) return;
    setIsGenerating(true);
    onError("");
    try {
      const payload: GenerateCourseInput = looksLikeUrl ? { url: trimmed, level } : { text: trimmed, level };
      const course = await window.newsEnglish.course.generate(payload);
      await onGenerated(course);
      setInput("");
    } catch (error) {
      onError(toMessage(error));
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div>
        <Header eyebrow="Course Generator" title="Turn a news article into a Khmer-supported English lesson." />
        <div className="mt-6 rounded-lg border border-ink/10 bg-white p-5 shadow-panel">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <label className="text-sm font-semibold" htmlFor="article-input">
                News article or URL
              </label>
              <p className="mt-1 text-sm text-ink/55">Paste full article text or an article link.</p>
            </div>
            <select
              className="h-10 rounded-lg border border-ink/15 bg-white px-3 text-sm font-medium"
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
            className="min-h-80 w-full resize-none rounded-lg border border-ink/15 bg-paper p-4 text-sm leading-6 text-ink placeholder:text-ink/35"
            placeholder="Paste a news article, or enter https://..."
            value={input}
            onChange={(event) => setInput(event.target.value)}
          />
          <div className="mt-4 flex items-center justify-between gap-4">
            <p className="text-sm text-ink/55">
              {looksLikeUrl ? "URL mode" : `${trimmed.length.toLocaleString()} characters`}
            </p>
            <button
              className="inline-flex h-11 items-center gap-2 rounded-lg bg-teal px-5 text-sm font-semibold text-white shadow-panel transition hover:bg-teal/90 disabled:cursor-not-allowed disabled:bg-ink/25"
              disabled={!canGenerate || isGenerating || geminiStatus?.installed === false}
              onClick={generate}
              type="button"
            >
              {isGenerating ? <Loader2 className="animate-spin" size={18} /> : <Wand2 size={18} />}
              {isGenerating ? "Generating" : "Generate"}
            </button>
          </div>
        </div>
      </div>
      <aside className="space-y-4">
        <InfoPanel title="Course output" icon={<FileText size={18} />}>
          Sentence translations, Khmer grammar explanations, tense notes, vocabulary, quizzes, and cloze practice.
        </InfoPanel>
        <InfoPanel title="Local library" icon={<BookOpen size={18} />}>
          Courses and vocabulary are saved to SQLite on this computer.
        </InfoPanel>
        <InfoPanel title="Gemini status" icon={<Sparkles size={18} />}>
          {geminiStatus?.installed ? geminiStatus.path ?? "Gemini CLI found." : geminiStatus?.error ?? "Checking Gemini CLI."}
        </InfoPanel>
      </aside>
    </section>
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
          <article key={course.id} className="rounded-lg border border-ink/10 bg-white p-5 shadow-panel">
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
            <p className="line-clamp-3 text-sm leading-6 text-ink/65">{course.summary}</p>
            <div className="mt-5 flex items-center justify-between gap-3">
              <div className="flex flex-wrap gap-2 text-xs text-ink/60">
                <Badge>{course.sourceType}</Badge>
                <Badge>{course.vocabularyCount} words</Badge>
                <Badge>{new Date(course.createdAt).toLocaleDateString()}</Badge>
              </div>
              <button
                className="inline-flex h-10 items-center gap-2 rounded-lg bg-ink px-4 text-sm font-semibold text-white"
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
  onVocabularyChanged
}: {
  course: StoredCourse;
  highlightSentenceId: string | null;
  onVocabularyChanged: () => Promise<void>;
}): ReactElement {
  useEffect(() => {
    if (!highlightSentenceId) return;
    document.getElementById(`sentence-${highlightSentenceId}`)?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [highlightSentenceId, course.id]);

  return (
    <article>
      <div className="rounded-lg bg-ink p-6 text-white shadow-panel">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-white/60">{course.level}</p>
            <h1 className="mt-2 max-w-4xl text-3xl font-semibold">{course.title}</h1>
            <p className="mt-3 max-w-4xl text-sm leading-6 text-white/70">{course.summary}</p>
          </div>
          <Badge dark>{new Date(course.createdAt).toLocaleString()}</Badge>
        </div>
      </div>

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

      <section className="mt-6 rounded-lg border border-ink/10 bg-white shadow-panel">
        <div className="border-b border-ink/10 px-5 py-4">
          <h2 className="text-lg font-semibold">Sentence study</h2>
        </div>
        <div className="divide-y divide-ink/10">
          {course.sentences.map((sentence, index) => (
            <div
              id={`sentence-${sentence.id}`}
              key={sentence.id}
              className={`grid gap-4 p-5 transition lg:grid-cols-[42px_minmax(0,1fr)_minmax(280px,36%)] ${
                highlightSentenceId === sentence.id ? "bg-gold/10" : "bg-white"
              }`}
            >
              <div className="grid h-9 w-9 place-items-center rounded-lg bg-paper text-sm font-semibold text-ink/60">
                {index + 1}
              </div>
              <div>
                <p className="text-base font-semibold leading-7">{sentence.english}</p>
                <p className="mt-2 text-base leading-8 text-ink/75">{sentence.khmer}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {sentence.vocabulary.map((item) => (
                    <button
                      key={item.id}
                      className={`rounded-lg border px-3 py-1.5 text-xs font-semibold ${
                        item.isBookmarked
                          ? "border-teal/30 bg-teal/10 text-teal"
                          : "border-ink/10 bg-paper text-ink/60"
                      }`}
                      onClick={async () => {
                        await window.newsEnglish.vocabulary.setBookmarked(item.id, !item.isBookmarked);
                        await onVocabularyChanged();
                      }}
                      type="button"
                      title={item.khmer}
                    >
                      {item.word}
                    </button>
                  ))}
                </div>
              </div>
              <div className="rounded-lg bg-paper p-4">
                <Badge>{sentence.tense}</Badge>
                <p className="mt-3 text-sm leading-7 text-ink/70">{sentence.grammarExplanationKm}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-6 grid gap-4 lg:grid-cols-2">
        {course.exercises.map((exercise) => (
          <div key={exercise.id} className="rounded-lg border border-ink/10 bg-white p-5 shadow-panel">
            <Badge>{exercise.type}</Badge>
            <h3 className="mt-3 text-lg font-semibold">{exercise.prompt}</h3>
            {exercise.choices.length ? (
              <div className="mt-4 grid gap-2">
                {exercise.choices.map((choice) => (
                  <div
                    className={`rounded-lg border px-3 py-2 text-sm ${
                      choice === exercise.answer ? "border-teal/40 bg-teal/10" : "border-ink/10 bg-paper"
                    }`}
                    key={choice}
                  >
                    {choice}
                  </div>
                ))}
              </div>
            ) : null}
            <p className="mt-4 text-sm font-semibold">Answer: {exercise.answer}</p>
            <p className="mt-2 text-sm leading-6 text-ink/65">{exercise.explanationKm}</p>
          </div>
        ))}
      </section>
    </article>
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
          <article key={item.id} className="rounded-lg border border-ink/10 bg-white p-5 shadow-panel">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-2xl font-semibold">{item.word}</p>
                <p className="mt-1 text-sm font-medium text-teal">{item.khmer}</p>
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
            <p className="mt-3 text-sm leading-6 text-ink/65">{item.definitionEn}</p>
            <div className="mt-4 rounded-lg bg-paper p-3 text-sm leading-6">
              <p className="font-medium">{item.exampleEn}</p>
              <p className="mt-1 text-ink/65">{item.exampleKm}</p>
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

function SettingsScreen({ status, onRefresh }: { status: GeminiStatus | null; onRefresh: () => Promise<void> }): ReactElement {
  const [checking, setChecking] = useState(false);
  return (
    <section>
      <Header eyebrow="Settings" title="Generation setup" />
      <div className="mt-6 rounded-lg border border-ink/10 bg-white p-5 shadow-panel">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold">Gemini CLI</h2>
            <p className="mt-1 text-sm text-ink/60">
              {status?.installed ? "Installed and available to Electron." : "Install or authenticate Gemini CLI to generate courses."}
            </p>
          </div>
          <button
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-ink px-4 text-sm font-semibold text-white"
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

function Header({ eyebrow, title }: { eyebrow: string; title: string }): ReactElement {
  return (
    <header>
      <p className="text-sm font-semibold uppercase tracking-wide text-coral">{eyebrow}</p>
      <h1 className="mt-2 max-w-4xl text-3xl font-semibold tracking-normal text-ink">{title}</h1>
    </header>
  );
}

function InfoPanel({ title, icon, children }: { title: string; icon: ReactNode; children: ReactNode }): ReactElement {
  return (
    <div className="rounded-lg border border-ink/10 bg-white p-4 shadow-panel">
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink">
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-paper text-teal">{icon}</span>
        {title}
      </div>
      <div className="text-sm leading-6 text-ink/65">{children}</div>
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
    <div className="mt-5 flex h-11 max-w-xl items-center gap-3 rounded-lg border border-ink/10 bg-white px-3 shadow-panel">
      <Search size={17} className="text-ink/40" />
      <input
        className="min-w-0 flex-1 border-0 bg-transparent text-sm outline-none placeholder:text-ink/35"
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
    <div className="grid gap-3 rounded-lg bg-paper p-3 sm:grid-cols-[120px_minmax(0,1fr)]">
      <dt className="font-semibold text-ink/65">{label}</dt>
      <dd className="break-all text-ink">{value}</dd>
    </div>
  );
}

function EmptyState({ title, detail }: { title: string; detail: string }): ReactElement {
  return (
    <div className="mt-8 rounded-lg border border-dashed border-ink/20 bg-white/60 p-10 text-center">
      <p className="text-lg font-semibold">{title}</p>
      <p className="mt-2 text-sm text-ink/55">{detail}</p>
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

function toMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export default App;
