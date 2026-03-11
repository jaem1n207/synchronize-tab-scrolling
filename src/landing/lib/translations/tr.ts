import type { TranslationStrings } from './types';

const tr: TranslationStrings = {
  header: {
    features: 'Özellikler',
    useCases: 'Kullanım Alanları',
    install: 'Yükle',
  },
  hero: {
    headline: 'Yerinizi kaybetmeyin.',
    subheadline:
      'Bir kez kaydırın, her yerde senkronize edin. Sekmelerinizi birlikte kaydıran ücretsiz bir tarayıcı uzantısı — çevirileri, kodu veya belgeleri yan yana karşılaştırmak için mükemmel.',
    enableSync: 'Senkronizasyonu Etkinleştir',
    syncing: 'Senkronize ediliyor',
    scrollHint: 'Sol paneli kaydırın',
    scrollHintSynced: 'Herhangi bir paneli kaydırın',
    scrollHintAdjusting: 'Ayrı ayrı ayarlamak için {modifier} basılı tutun + kaydırın',
    manualOffset: 'Manuel ofset',
    synced: 'Senkronize edildi',
    notSynced: 'Senkronize edilmedi',
    adjusting: 'Ayarlanıyor',
    trustSignal: 'Ücretsiz · Hesap gerekmez · Açık kaynak',
  },
  problem: {
    text: 'İki sekmeyi manuel olarak kaydırmıyorsunuz. Tarayıcının otomatik olarak halletmesi gereken işi yapıyorsunuz.',
  },
  howItWorks: {
    title: 'Nasıl çalışır',
    steps: [
      {
        title: 'Uzantıyı yükleyin',
        description:
          'Tek tıklamayla tarayıcınıza ekleyin. Chrome, Firefox, Edge ve tüm Chromium tabanlı tarayıcılarla çalışır.',
      },
      {
        title: 'Senkronize edilecek sekmeleri seçin',
        description:
          'Uzantı açılır penceresini açın, birbirine bağlamak istediğiniz sekmeleri seçin.',
      },
      {
        title: 'İstediğiniz yerde kaydırın',
        description: 'Bir sekmede kaydırın — bağlı tüm sekmeler otomatik olarak aynı konuma gelir.',
      },
    ],
  },
  features: {
    title: 'Özellikler',
    items: [
      {
        title: 'Gerçek zamanlı kaydırma senkronizasyonu',
        description: 'Bir sekmede kaydırın, bağlı tüm sekmeler anında aynı göreli konuma taşınır.',
      },
      {
        title: 'Manuel konum ayarı',
        description:
          'Senkronizasyonu bozmadan tek tek sekmeleri ayarlamak için kaydırırken {modifier} tuşunu basılı tutun.',
      },
      {
        title: 'Otomatik senkronizasyon önerisi',
        description:
          'Birden fazla sekmede aynı URL açıldı mı? Bir bildirim tek tıklamayla senkronizasyon önerir.',
      },
      {
        title: 'URL gezinme senkronizasyonu',
        description:
          "Bir sekmede bağlantıya tıklayın — bağlı tüm sekmeler birlikte aynı URL'ye gider.",
      },
      {
        title: 'Alan adı hariç tutma',
        description:
          'Belirli alan adlarını otomatik senkronizasyon önerilerinden kalıcı olarak hariç tutun.',
      },
      {
        title: 'Otomatik yeniden bağlanma',
        description:
          'Uyku sonrası bağlantı kesildi mi? Uzantı otomatik olarak yeniden bağlanır ve senkronizasyona devam eder.',
      },
    ],
  },
  useCases: {
    title: 'Bu kimin için?',
    items: [
      {
        role: 'Çevirmenler',
        description: 'Yerinizi kaybetmeden orijinal ve çevrilmiş belgeleri yan yana karşılaştırın.',
      },
      {
        role: 'Geliştiriciler',
        description:
          "Kod sürümlerini karşılaştırın, pull request'leri inceleyin veya kaynak kodun yanında belgeleri okuyun.",
      },
      {
        role: 'Araştırmacılar',
        description: 'Birden fazla makale veya veri kaynağını aynı anda çapraz referanslayın.',
      },
      {
        role: 'Öğrenciler',
        description:
          'Ders kitaplarını ve notları birlikte çalışın, okurken ikisini de senkronize tutun.',
      },
    ],
  },
  trust: {
    title: 'Önce gizlilik. Her zaman.',
    badges: {
      noData: 'Veri toplama yok',
      noAnalytics: 'İzleme çerezi yok',
      offline: 'Çevrimdışı çalışır',
      openSource: 'Açık kaynak',
      languages: '9 dil',
      accessible: 'WCAG 2.1 AA',
    },
    browsers: 'Tüm büyük tarayıcılarda çalışır',
  },
  cta: {
    title: 'Senkronize etmeye hazır mısınız?',
    subtitle: 'Sonsuza kadar ücretsiz. 3 saniyede yükleyin.',
  },
  footer: {
    tagline: 'Bir kez kaydırın, her yerde senkronize edin.',
    links: 'Bağlantılar',
    support: 'Destek',
    github: 'GitHub',
    reportBug: 'Hata bildir',
    email: 'E-posta',
    license: 'Source Available Lisansı',
    madeBy: 'Yapan',
  },
  common: {
    addTo: "{browser}'a ekle",
    alsoAvailableOn: 'Ayrıca şurada mevcut',
  },
};

export default tr;
