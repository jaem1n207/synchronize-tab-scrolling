import type { TranslationStrings } from './types';

const vi: TranslationStrings = {
  header: {
    features: 'Tính năng',
    useCases: 'Trường hợp sử dụng',
    install: 'Cài đặt',
  },
  hero: {
    headline: 'Đừng để mất vị trí đang đọc.',
    subheadline:
      'Cuộn một lần, đồng bộ khắp nơi. Tiện ích mở rộng trình duyệt miễn phí giúp các tab của bạn cuộn cùng nhau — lý tưởng để so sánh bản dịch, code hoặc tài liệu song song.',
    enableSync: 'Bật đồng bộ',
    syncing: 'Đang đồng bộ',
    scrollHint: 'Cuộn bảng bên trái',
    scrollHintSynced: 'Cuộn bảng bất kỳ',
    scrollHintAdjusting: 'Giữ {modifier} + cuộn để điều chỉnh riêng lẻ',
    manualOffset: 'Độ lệch thủ công',
    synced: 'Đã đồng bộ',
    notSynced: 'Chưa đồng bộ',
    adjusting: 'Đang điều chỉnh',
    trustSignal: 'Miễn phí · Không cần tài khoản · Mã nguồn mở',
  },
  problem: {
    text: 'Bạn không chỉ đang cuộn thủ công hai tab. Bạn đang làm công việc mà trình duyệt đáng lẽ phải tự xử lý.',
  },
  howItWorks: {
    title: 'Cách hoạt động',
    steps: [
      {
        title: 'Cài đặt tiện ích mở rộng',
        description:
          'Thêm vào trình duyệt chỉ với một cú nhấp. Hoạt động với Chrome, Firefox, Edge và tất cả trình duyệt dựa trên Chromium.',
      },
      {
        title: 'Chọn tab để đồng bộ',
        description: 'Mở popup tiện ích mở rộng, chọn các tab bạn muốn liên kết với nhau.',
      },
      {
        title: 'Cuộn ở bất kỳ đâu',
        description: 'Cuộn trong một tab — tất cả tab được liên kết tự động theo đến cùng vị trí.',
      },
    ],
  },
  features: {
    title: 'Tính năng',
    items: [
      {
        title: 'Đồng bộ cuộn theo thời gian thực',
        description:
          'Cuộn trong một tab, tất cả tab được liên kết di chuyển ngay lập tức đến cùng vị trí tương đối.',
      },
      {
        title: 'Điều chỉnh vị trí thủ công',
        description:
          'Giữ {modifier} khi cuộn để điều chỉnh từng tab riêng lẻ mà không làm gián đoạn đồng bộ.',
      },
      {
        title: 'Gợi ý tự động đồng bộ',
        description:
          'Mở cùng một URL trong nhiều tab? Thông báo sẽ gợi ý đồng bộ chỉ với một cú nhấp.',
      },
      {
        title: 'Đồng bộ điều hướng URL',
        description:
          'Nhấp vào liên kết trong một tab — tất cả tab được liên kết cùng điều hướng đến URL đó.',
      },
      {
        title: 'Loại trừ tên miền',
        description: 'Loại trừ vĩnh viễn các tên miền cụ thể khỏi gợi ý tự động đồng bộ.',
      },
      {
        title: 'Tự động kết nối lại',
        description: 'Mất kết nối sau khi ngủ? Tiện ích tự động kết nối lại và tiếp tục đồng bộ.',
      },
    ],
  },
  useCases: {
    title: 'Dành cho ai?',
    items: [
      {
        role: 'Dịch giả',
        description: 'So sánh tài liệu gốc và bản dịch song song mà không mất vị trí đang đọc.',
      },
      {
        role: 'Lập trình viên',
        description:
          'So sánh các phiên bản code, xem xét pull request hoặc đọc tài liệu bên cạnh mã nguồn.',
      },
      {
        role: 'Nhà nghiên cứu',
        description: 'Đối chiếu nhiều bài báo hoặc nguồn dữ liệu cùng một lúc.',
      },
      {
        role: 'Sinh viên',
        description: 'Học sách giáo khoa và ghi chú cùng nhau, giữ cả hai đồng bộ khi đọc.',
      },
    ],
  },
  trust: {
    title: 'Quyền riêng tư là ưu tiên. Luôn luôn.',
    badges: {
      noData: 'Không thu thập dữ liệu',
      noAnalytics: 'Không cookie theo dõi',
      offline: 'Hoạt động ngoại tuyến',
      openSource: 'Mã nguồn mở',
      languages: '10 ngôn ngữ',
      accessible: 'WCAG 2.1 AA',
    },
    browsers: 'Hoạt động trên tất cả trình duyệt phổ biến',
  },
  cta: {
    title: 'Sẵn sàng đồng bộ?',
    subtitle: 'Miễn phí mãi mãi. Cài đặt trong 3 giây.',
  },
  footer: {
    tagline: 'Cuộn một lần, đồng bộ khắp nơi.',
    links: 'Liên kết',
    support: 'Hỗ trợ',
    github: 'GitHub',
    reportBug: 'Báo cáo lỗi',
    email: 'Email',
    license: 'Giấy phép Source Available',
    madeBy: 'Tạo bởi',
  },
  common: {
    addTo: 'Thêm vào {browser}',
    alsoAvailableOn: 'Cũng có trên',
  },
};

export default vi;
