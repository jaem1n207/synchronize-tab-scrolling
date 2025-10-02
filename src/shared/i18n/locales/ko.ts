import type { Translations } from '../types';

export const ko: Translations = {
  appName: '탭 스크롤 동기화',
  appDescription: '여러 브라우저 탭의 스크롤 위치를 동기화합니다',

  tabSelection: {
    heading: '동기화할 탭 선택',
    selectedCount: '{count}개 선택됨',
    noTabs: '사용 가능한 탭이 없습니다',
    ineligibleTab: '이 탭은 동기화할 수 없습니다',
  },

  syncControls: {
    startSync: '동기화 시작',
    stopSync: '동기화 중지',
    resync: '재동기화',
    syncActive: '동기화 활성',
    syncInactive: '동기화 비활성',
  },

  panel: {
    minimize: '최소화',
    maximize: '최대화',
    dragToMove: '드래그하여 이동',
  },

  linkedSites: {
    heading: '연결된 탭',
    currentTab: '현재',
    switchToTab: '이 탭으로 전환',
    noLinkedTabs: '현재 연결된 탭이 없습니다',
  },

  connectionStatus: {
    connected: '연결됨',
    disconnected: '연결 끊김',
    error: '오류',
  },

  errors: {
    loadTabsFailed: '탭을 불러오지 못했습니다. 확장 프로그램을 새로고침해주세요.',
    startSyncFailed: '동기화를 시작하지 못했습니다. 다시 시도해주세요.',
    stopSyncFailed: '경고: 동기화를 제대로 중지하지 못했습니다. 로컬 상태는 초기화되었습니다.',
    switchTabFailed: '탭 전환에 실패했습니다. 탭이 닫혔을 수 있습니다.',
    minTabsRequired: '동기화하려면 최소 2개의 탭을 선택하세요.',
    tabClosedOrUnavailable: '탭이 닫혔거나 사용할 수 없습니다',
  },

  success: {
    syncStarted: '{count}개 탭에 대한 동기화를 성공적으로 시작했습니다.',
    syncStopped: '동기화가 성공적으로 중지되었습니다.',
    tabSwitched: '탭 전환에 성공했습니다.',
  },

  warnings: {
    stopSyncWarning: '정말 동기화를 중지하시겠습니까?',
  },

  ineligibilityReasons: {
    webStore: '웹 스토어 페이지는 보안 제한으로 인해 동기화할 수 없습니다',
    googleServices: 'Google 서비스 페이지는 동기화를 방지하는 제한이 있습니다',
    browserInternal: '브라우저 내부 페이지는 보안 제한으로 인해 동기화할 수 없습니다',
    specialProtocol: '특수 프로토콜 페이지는 동기화할 수 없습니다',
    securityRestriction: '이 페이지는 보안 제한으로 인해 동기화할 수 없습니다',
  },

  features: {
    manualScrollMode: 'Option/Alt 키를 눌러 개별 탭 스크롤',
    elementBasedSync: 'DOM 구조를 사용한 지능형 콘텐츠 매칭',
    urlNavigationSync: '연결된 탭이 함께 탐색',
    statePersistence: '기본 설정이 자동으로 저장됩니다',
  },
};
