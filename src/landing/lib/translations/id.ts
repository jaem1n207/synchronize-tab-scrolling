import type { TranslationStrings } from './types';

const id: TranslationStrings = {
  header: {
    features: 'Fitur',
    useCases: 'Kasus Penggunaan',
    install: 'Pasang',
  },
  hero: {
    headline: 'Jangan sampai kehilangan posisi.',
    subheadline:
      'Gulir sekali, sinkron di mana saja. Ekstensi browser gratis yang menjaga tab Anda bergulir bersama — sempurna untuk membandingkan terjemahan, kode, atau dokumen secara berdampingan.',
    enableSync: 'Aktifkan Sinkronisasi',
    syncing: 'Menyinkronkan',
    scrollHint: 'Gulir panel kiri',
    scrollHintSynced: 'Gulir panel mana saja',
    scrollHintAdjusting: 'Tahan {modifier} + gulir untuk menyesuaikan secara individual',
    manualOffset: 'Offset manual',
    synced: 'Tersinkronkan',
    notSynced: 'Belum tersinkronkan',
    adjusting: 'Menyesuaikan',
    trustSignal: 'Gratis · Tanpa akun · Sumber terbuka',
  },
  problem: {
    text: 'Anda tidak sekadar menggulir dua tab secara manual. Anda melakukan pekerjaan yang seharusnya ditangani browser secara otomatis.',
  },
  howItWorks: {
    title: 'Cara kerjanya',
    steps: [
      {
        title: 'Pasang ekstensi',
        description:
          'Tambahkan ke browser dengan satu klik. Berfungsi dengan Chrome, Firefox, Edge, dan semua browser berbasis Chromium.',
      },
      {
        title: 'Pilih tab untuk disinkronkan',
        description: 'Buka popup ekstensi, pilih tab yang ingin Anda hubungkan.',
      },
      {
        title: 'Gulir di mana saja',
        description:
          'Gulir di satu tab — semua tab yang terhubung secara otomatis mengikuti ke posisi yang sama.',
      },
    ],
  },
  features: {
    title: 'Fitur',
    items: [
      {
        title: 'Sinkronisasi gulir real-time',
        description:
          'Gulir di satu tab, semua tab yang terhubung langsung berpindah ke posisi relatif yang sama.',
      },
      {
        title: 'Penyesuaian posisi manual',
        description:
          'Tahan {modifier} saat menggulir untuk menyesuaikan tab individual tanpa memutus sinkronisasi.',
      },
      {
        title: 'Saran sinkronisasi otomatis',
        description:
          'Membuka URL yang sama di beberapa tab? Notifikasi menyarankan sinkronisasi dengan satu klik.',
      },
      {
        title: 'Sinkronisasi navigasi URL',
        description:
          'Klik tautan di satu tab — semua tab yang terhubung bersama-sama menavigasi ke URL yang sama.',
      },
      {
        title: 'Pengecualian domain',
        description: 'Kecualikan domain tertentu secara permanen dari saran sinkronisasi otomatis.',
      },
      {
        title: 'Koneksi ulang otomatis',
        description:
          'Koneksi terputus setelah mode tidur? Ekstensi terhubung kembali dan melanjutkan sinkronisasi secara otomatis.',
      },
    ],
  },
  useCases: {
    title: 'Untuk siapa ini?',
    items: [
      {
        role: 'Penerjemah',
        description:
          'Bandingkan dokumen asli dan terjemahan secara berdampingan tanpa kehilangan posisi.',
      },
      {
        role: 'Pengembang',
        description:
          'Bandingkan versi kode, tinjau pull request, atau baca dokumentasi di samping kode sumber.',
      },
      {
        role: 'Peneliti',
        description: 'Referensi silang beberapa makalah atau sumber data secara bersamaan.',
      },
      {
        role: 'Pelajar',
        description:
          'Pelajari buku teks dan catatan bersama, menjaga keduanya tetap sinkron saat membaca.',
      },
    ],
  },
  trust: {
    title: 'Privasi adalah prioritas. Selalu.',
    badges: {
      noData: 'Tanpa pengumpulan data',
      noAnalytics: 'Tanpa cookie pelacak',
      offline: 'Berfungsi offline',
      openSource: 'Sumber terbuka',
      languages: '9 bahasa',
      accessible: 'WCAG 2.1 AA',
    },
    browsers: 'Berfungsi di semua browser utama',
  },
  cta: {
    title: 'Siap untuk menyinkronkan?',
    subtitle: 'Gratis selamanya. Pasang dalam 3 detik.',
  },
  footer: {
    tagline: 'Gulir sekali, sinkron di mana saja.',
    links: 'Tautan',
    support: 'Dukungan',
    github: 'GitHub',
    reportBug: 'Laporkan bug',
    email: 'Email',
    license: 'Lisensi Source Available',
    madeBy: 'Dibuat oleh',
  },
  common: {
    addTo: 'Tambahkan ke {browser}',
    alsoAvailableOn: 'Juga tersedia di',
  },
};

export default id;
