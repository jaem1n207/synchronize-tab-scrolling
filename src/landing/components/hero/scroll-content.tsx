interface ScrollContentProps {
  variant: 'en' | 'ko';
}

export function ScrollContent({ variant }: ScrollContentProps) {
  if (variant === 'ko') return <KoreanArticle />;
  return <EnglishArticle />;
}

function EnglishArticle() {
  return (
    <article className="p-4 md:p-6">
      <h2 className="mb-2 text-lg font-semibold text-foreground">
        The Evolution of Web Development
      </h2>
      <p className="mb-4 text-xs text-muted-foreground">Published Mar 2025 · 8 min read</p>

      <p className="mb-4 text-sm leading-relaxed text-foreground/90 md:text-base">
        The web has undergone a remarkable transformation since its inception. What began as a
        simple system for sharing academic documents has grown into the most powerful platform for
        human communication and commerce ever created. Every year brings new paradigms, new tools,
        and new ways of thinking about how we build for the browser.
      </p>

      <p className="mb-4 text-sm leading-relaxed text-foreground/90 md:text-base">
        In the early days, websites were static HTML pages — hand-coded, table-based layouts with
        inline styles and blinking text. Developers wrote markup in Notepad and uploaded via FTP.
        There were no frameworks, no build tools, and certainly no hot module replacement. Yet those
        constraints bred creativity that still echoes in modern design.
      </p>

      <h3 className="mb-2 mt-6 text-base font-semibold text-foreground">
        The Rise of JavaScript Frameworks
      </h3>

      <p className="mb-4 text-sm leading-relaxed text-foreground/90 md:text-base">
        jQuery changed everything in 2006. Suddenly, DOM manipulation was approachable. Ajax
        requests became trivial. But as applications grew in complexity, jQuery&apos;s imperative
        approach showed its limits. The era of single-page applications was born, bringing with it
        an explosion of competing ideas about how to structure client-side code.
      </p>

      <div className="mb-4 overflow-x-auto rounded-lg bg-muted/50 p-3 font-mono text-xs">
        <pre className="text-foreground/80">{`function ScrollSync({ children }) {
  const [synced, setSynced] = useState(false);
  const leftRef = useRef(null);
  const rightRef = useRef(null);

  useScrollSync(leftRef, rightRef, synced);

  return (
    <div className="flex gap-4">
      <Panel ref={leftRef} />
      <Panel ref={rightRef} />
    </div>
  );
}`}</pre>
      </div>

      <p className="mb-4 text-sm leading-relaxed text-foreground/90 md:text-base">
        React, Vue, and Angular redefined how we think about user interfaces. Components replaced
        page-level thinking. State management became a first-class concern. The virtual DOM
        abstracted away the messy reality of browser rendering, letting developers focus on
        describing what the UI should look like rather than how to make it so.
      </p>

      <blockquote className="mb-4 border-l-2 border-primary/30 pl-4 text-sm italic text-muted-foreground">
        &ldquo;The best interface is the one that gets out of your way and lets you focus on what
        matters — your work, your content, your ideas.&rdquo;
      </blockquote>

      <h3 className="mb-2 mt-6 text-base font-semibold text-foreground">What Comes Next</h3>

      <p className="mb-4 text-sm leading-relaxed text-foreground/90 md:text-base">
        Server components, streaming SSR, and edge computing are reshaping the landscape again. The
        line between server and client continues to blur. Performance is no longer an afterthought —
        it&apos;s a core architectural decision that shapes every layer of the stack.
      </p>

      <p className="text-sm leading-relaxed text-foreground/90 md:text-base">
        Browser extensions have evolved alongside the web itself. What once required complex NPAPI
        plugins now runs in sandboxed service workers with powerful APIs for tab management,
        storage, and cross-origin communication. The extension ecosystem is richer than ever,
        enabling tools that fundamentally change how people interact with their browser.
      </p>
    </article>
  );
}

function KoreanArticle() {
  return (
    <article className="p-4 md:p-6">
      <h2 className="mb-2 text-lg font-semibold text-foreground">웹 개발의 진화</h2>
      <p className="mb-4 text-xs text-muted-foreground">2025년 3월 게시 · 읽기 8분</p>

      <p className="mb-4 text-sm leading-relaxed text-foreground/90 md:text-base">
        웹은 탄생 이후 눈부신 변화를 겪었습니다. 학술 문서를 공유하기 위한 단순한 시스템으로 시작된
        것이 인류 역사상 가장 강력한 커뮤니케이션 및 상거래 플랫폼으로 성장했습니다. 매년 새로운
        패러다임, 새로운 도구, 브라우저를 위한 새로운 사고방식이 등장하고 있습니다.
      </p>

      <p className="mb-4 text-sm leading-relaxed text-foreground/90 md:text-base">
        초기 웹사이트는 정적 HTML 페이지였습니다. 테이블 기반 레이아웃에 인라인 스타일, 깜빡이는
        텍스트까지. 개발자들은 메모장에서 마크업을 작성하고 FTP로 업로드했습니다. 프레임워크도, 빌드
        도구도, 핫 모듈 교체 같은 것은 존재하지 않았습니다. 그러나 그 제약들이 현대 디자인에도
        여전히 울려 퍼지는 창의성을 낳았습니다.
      </p>

      <h3 className="mb-2 mt-6 text-base font-semibold text-foreground">
        JavaScript 프레임워크의 부상
      </h3>

      <p className="mb-4 text-sm leading-relaxed text-foreground/90 md:text-base">
        2006년 jQuery가 모든 것을 바꿨습니다. 갑자기 DOM 조작이 쉬워졌고, Ajax 요청은
        간단해졌습니다. 하지만 애플리케이션의 복잡성이 커지면서 jQuery의 명령형 접근 방식은 한계를
        드러냈고, 단일 페이지 애플리케이션의 시대가 열리면서 클라이언트 측 코드를 구조화하는 방법에
        대한 수많은 경쟁 아이디어가 쏟아졌습니다.
      </p>

      <div className="mb-4 overflow-x-auto rounded-lg bg-muted/50 p-3 font-mono text-xs">
        <pre className="text-foreground/80">{`function ScrollSync({ children }) {
  const [synced, setSynced] = useState(false);
  const leftRef = useRef(null);
  const rightRef = useRef(null);

  useScrollSync(leftRef, rightRef, synced);

  return (
    <div className="flex gap-4">
      <Panel ref={leftRef} />
      <Panel ref={rightRef} />
    </div>
  );
}`}</pre>
      </div>

      <p className="mb-4 text-sm leading-relaxed text-foreground/90 md:text-base">
        React, Vue, Angular은 사용자 인터페이스에 대한 사고방식 자체를 재정의했습니다. 컴포넌트가
        페이지 단위의 사고를 대체했고, 상태 관리는 핵심 관심사가 되었습니다. 가상 DOM은 브라우저
        렌더링의 복잡한 현실을 추상화하여 개발자가 UI가 어떻게 보여야 하는지를 기술하는 데 집중할 수
        있게 해주었습니다.
      </p>

      <blockquote className="mb-4 border-l-2 border-primary/30 pl-4 text-sm italic text-muted-foreground">
        &ldquo;최고의 인터페이스는 사용자의 앞길에서 벗어나 정말 중요한 것 — 작업, 콘텐츠,
        아이디어에 집중할 수 있게 해주는 것입니다.&rdquo;
      </blockquote>

      <h3 className="mb-2 mt-6 text-base font-semibold text-foreground">다음은 무엇인가</h3>

      <p className="mb-4 text-sm leading-relaxed text-foreground/90 md:text-base">
        서버 컴포넌트, 스트리밍 SSR, 엣지 컴퓨팅이 다시 한번 판도를 바꾸고 있습니다. 서버와
        클라이언트의 경계는 계속 흐려지고 있습니다. 성능은 더 이상 부차적인 요소가 아니라 스택의
        모든 계층을 형성하는 핵심 아키텍처 결정입니다.
      </p>

      <p className="text-sm leading-relaxed text-foreground/90 md:text-base">
        브라우저 확장 프로그램도 웹과 함께 진화해왔습니다. 한때 복잡한 NPAPI 플러그인이 필요했던
        기능이 이제는 탭 관리, 저장소, 교차 출처 통신을 위한 강력한 API를 갖춘 샌드박스 서비스
        워커에서 실행됩니다. 확장 생태계는 그 어느 때보다 풍부해져, 사람들이 브라우저와 상호작용하는
        방식을 근본적으로 바꾸는 도구들을 가능하게 합니다.
      </p>
    </article>
  );
}
