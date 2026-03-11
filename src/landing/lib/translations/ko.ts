import type { TranslationStrings } from './types';

const ko: TranslationStrings = {
  header: {
    features: '기능',
    useCases: '사용 사례',
    install: '설치',
  },
  hero: {
    headline: '더 이상 스크롤 위치를\n잃지 마세요.',
    subheadline:
      '한 번의 스크롤로 모든 탭을 동기화하세요. 번역, 코드, 문서를 나란히 비교할 때 완벽한 무료 브라우저 확장 프로그램입니다.',
    enableSync: '동기화 시작',
    syncing: '동기화 중',
    scrollHint: '왼쪽 패널을 스크롤해 보세요',
    scrollHintSynced: '아무 패널이나 스크롤해 보세요',
    scrollHintAdjusting: '{modifier} 키를 누른 채 스크롤하면 개별 조정',
    manualOffset: '개별 조정값',
    synced: '동기화됨',
    notSynced: '동기화 안됨',
    adjusting: '개별 조정 중',
    trustSignal: '무료 · 계정 불필요 · 오픈소스',
  },
  problem: {
    text: '두 개의 탭을 수동으로 스크롤하고 있는 게 아닙니다. 브라우저가 자동으로 처리해야 할 일을 하고 있는 겁니다.',
  },
  howItWorks: {
    title: '사용 방법',
    steps: [
      {
        title: '확장 프로그램 설치',
        description:
          '한 번의 클릭으로 브라우저에 추가하세요. Chrome, Firefox, Edge 등 모든 Chromium 기반 브라우저를 지원합니다.',
      },
      {
        title: '동기화할 탭 선택',
        description: '확장 프로그램 팝업을 열고 연결할 탭을 선택하세요.',
      },
      {
        title: '어디서든 스크롤',
        description: '한 탭에서 스크롤하면 연결된 모든 탭이 같은 위치로 자동 이동합니다.',
      },
    ],
  },
  features: {
    title: '기능',
    items: [
      {
        title: '실시간 스크롤 동기화',
        description: '한 탭에서 스크롤하면 연결된 모든 탭이 같은 상대적 위치로 즉시 이동합니다.',
      },
      {
        title: '수동 위치 조정',
        description:
          '{modifier} 키를 누른 채 스크롤하면 동기화를 유지하면서 개별 탭의 위치를 조정할 수 있습니다.',
      },
      {
        title: '자동 동기화 제안',
        description:
          '같은 URL을 여러 탭에서 열면 한 번의 클릭으로 동기화를 제안하는 알림이 표시됩니다.',
      },
      {
        title: 'URL 내비게이션 동기화',
        description: '한 탭에서 링크를 클릭하면 연결된 모든 탭이 같은 URL로 함께 이동합니다.',
      },
      {
        title: '도메인 제외',
        description: '특정 도메인을 자동 동기화 제안에서 영구적으로 제외할 수 있습니다.',
      },
      {
        title: '자동 재연결',
        description:
          '절전 모드 후 연결이 끊겼나요? 확장 프로그램이 자동으로 재연결하고 동기화를 재개합니다.',
      },
    ],
  },
  useCases: {
    title: '누구를 위한 도구인가요?',
    items: [
      {
        role: '번역가',
        description: '원문과 번역 문서를 나란히 비교하면서 위치를 잃지 않습니다.',
      },
      {
        role: '개발자',
        description: '코드 버전 비교, PR 리뷰, 또는 소스 코드와 문서를 함께 볼 수 있습니다.',
      },
      {
        role: '연구자',
        description: '여러 논문이나 데이터 소스를 동시에 교차 참조할 수 있습니다.',
      },
      {
        role: '학생',
        description: '교과서와 노트를 함께 동기화하며 읽을 수 있습니다.',
      },
    ],
  },
  trust: {
    title: '프라이버시를 최우선으로.',
    badges: {
      noData: '데이터 수집 없음',
      noAnalytics: '추적 쿠키 없음',
      offline: '오프라인 작동',
      openSource: '오픈소스',
      languages: '9개 언어 지원',
      accessible: 'WCAG 2.1 AA',
    },
    browsers: '모든 주요 브라우저에서 작동',
  },
  cta: {
    title: '동기화할 준비가 되셨나요?',
    subtitle: '영원히 무료. 3초면 설치 완료.',
  },
  footer: {
    tagline: '한 번의 스크롤로 모든 탭을.',
    links: '링크',
    support: '지원',
    github: 'GitHub',
    reportBug: '버그 신고',
    email: '이메일',
    license: '소스 공개 라이선스',
    madeBy: '만든이',
  },
  common: {
    addTo: '{browser}에 추가',
    alsoAvailableOn: '다음에서도 사용 가능',
  },
};

export default ko;
