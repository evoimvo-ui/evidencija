const fs = require('fs');
const path = require('path');

const LANG_DIR = path.join(process.cwd(), 'lang');

const master = JSON.parse(fs.readFileSync(path.join(LANG_DIR, 'en.json'), 'utf8'));
const masterKeys = Object.keys(master);
console.log('MASTER en.json keys:', masterKeys.length);

const NEW_KEYS_START = 223;
const bookingKeys = masterKeys.slice(NEW_KEYS_START);
console.log('Booking keys count:', bookingKeys.length);
console.log('Booking keys:', bookingKeys.join(', '));

const bookingKeyMap = {};
bookingKeys.forEach((k, i) => { bookingKeyMap[k] = i; });

// 43 NEW TRANSLATIONS IN ORDER for: tr, ur, zh
const newTranslations = {
  tr: [
    'Çalışma Saatleri',
    'Rezervasyon bağlantısı adı',
    'Uygunluğu kontrol et',
    '✓ Uygun',
    '✗ Alınmış, başka bir tane deneyin',
    'Bu kayıt adınız değil — bu, rezervasyon bağlantınız için genel bir tanımlayıcıdır.',
    'Pazartesi',
    'Salı',
    'Çarşamba',
    'Perşembe',
    'Cuma',
    'Cumartesi',
    'Pazar',
    'Aktif',
    'Başlangıç',
    'Bitiş',
    'Çalışma saatlerini kaydet',
    'Lütfen tüm aktif \"Başlangıç\" saatlerinin \"Bitiş\" saatlerinden önce olduğundan emin olun!',
    'İzin',
    '➕ İzin dönemi ekle',
    'İzin Dönemi',
    'Sebep',
    'Bu izin dönemi kaldırılsın mı?',
    'İzin dönemi kaydedildi!',
    'Randevu Al',
    'Hizmet, tarih ve saat seçin',
    'Hizmet Seçin',
    'Tarih Seçin',
    'Saat Seçin',
    'Ad Soyad *',
    'Adınız',
    'Telefon *',
    '+90...',
    'E-posta (isteğe bağlı)',
    'eposta@ornek.com',
    'Not (isteğe bağlı)',
    'Herhangi ek bilgi...',
    'Rezervasyonu Onayla',
    'Rezervasyon Onaylandı!',
    'Bu dil artık uygun değil. Lütfen başka bir tane seçin.',
    'Yükleniyor...',
    'Bir hata oluştu. Lütfen tekrar deneyin.',
    'Bu tarih için uygun dil yok'
  ],

  ur: [
    'کام کے اوقات',
    'بکنگ لنک کا نام',
    'دستیابی چیک کریں',
    '✓ دستیاب ہے',
    '✗ لے چکا ہے، دوسرا آزمائیں',
    'یہ آپ کا رجسٹریشن نام نہیں ہے — یہ آپ کے بکنگ لنک کے لیے ایک عوامی شناخت کنندہ ہے۔',
    'پیر',
    'منگل',
    'بدھ',
    'جمعرات',
    'جمعہ',
    'ہفتہ',
    'اتوار',
    'فعال',
    'سے',
    'تک',
    'کام کے اوقات محفوظ کریں',
    'براہ کرم یقینی بنائیں کہ تمام فعال "سے" اوقات "تک" اوقات سے پہلے ہیں!',
    'چھٹی',
    '➕ چھٹی کی مدت شامل کریں',
    'چھٹی کی مدت',
    'وجہ',
    'کیا اس چھٹی کی مدت کو ہٹانا ہے؟',
    'چھٹی کی مدت محفوظ ہوگئی!',
    'اپائنٹمنٹ بک کریں',
    'سروس، تاریخ اور وقت منتخب کریں',
    'سروس منتخب کریں',
    'تاریخ منتخب کریں',
    'وقت منتخب کریں',
    'مکمل نام *',
    'آپ کا نام',
    'فون *',
    '+92...',
    'ای میل (اختیاری)',
    'email@example.pk',
    'نوٹ (اختیاری)',
    'کوئی اضافی معلومات...',
    'بکنگ کی تصدیق کریں',
    'بکنگ تصدیق شدہ!',
    'یہ سلاٹ اب دستیاب نہیں ہے۔ براہ کرم دوسرا منتخب کریں۔',
    'لوڈ ہو رہا ہے...',
    'کوئی خرابی پیش آگئی۔ براہ کرم دوبارہ کوشش کریں۔',
    'اس تاریخ کے لیے کوئی دستیاب سلاٹ نہیں ہے'
  ],

  zh: [
    '工作时间',
    '预约链接名称',
    '检查可用性',
    '✓ 可用',
    '✗ 已被占用，请尝试其他名称',
    '这不是您的注册名称 — 这是您预约链接的公开标识符。',
    '星期一',
    '星期二',
    '星期三',
    '星期四',
    '星期五',
    '星期六',
    '星期日',
    '活跃',
    '开始',
    '结束',
    '保存工作时间',
    '请确保所有活跃的"开始"时间都早于"结束"时间！',
    '休假',
    '➕ 添加休假期',
    '休假期',
    '原因',
    '是否移除此休假时间？',
    '休假已保存！',
    '预约',
    '选择服务、日期和时间',
    '选择服务',
    '选择日期',
    '选择时间',
    '姓名 *',
    '您的姓名',
    '电话 *',
    '+86...',
    '电子邮箱（可选）',
    'email@example.cn',
    '备注（可选）',
    '任何其他信息...',
    '确认预约',
    '预约已确认！',
    '该时段已不可用。请选择另一个时段。',
    '加载中...',
    '发生错误，请重试。',
    '该日期无可用时段'
  ]
};

// Also define fixes for corrupted_data, confirm_delete_client, client_deleted (they exist but need translation if they were English)
// From analysis: tr.json had them in English, ur.json in English, zh.json in English
const extraTranslations = {
  tr: {
    corrupted_data: 'Bozuk Veri',
    confirm_delete_client: 'Bu müşteriyi ve tüm geçmişini silmek istediğinize emin misiniz?',
    client_deleted: 'Müşteri silindi!'
  },
  ur: {
    corrupted_data: 'خراب ڈیٹا',
    confirm_delete_client: 'کیا اس گاہک اور اس کی تمام تاریخ کو حذف کرنا ہے؟',
    client_deleted: 'گاہک حذف ہوگیا!'
  },
  zh: {
    corrupted_data: '数据损坏',
    confirm_delete_client: '确定删除此客户及其所有历史记录吗？',
    client_deleted: '客户已删除！'
  }
};

const TARGETS = ['tr', 'ur', 'zh'];
let allOK = true;

for (const lang of TARGETS) {
  const filePath = path.join(LANG_DIR, lang + '.json');
  const existing = JSON.parse(fs.readFileSync(filePath, 'utf8'));

  const clean = {};
  let keptExisting = 0;
  let missingFixed = 0;
  let translatedExtra = 0;

  for (const masterKey of masterKeys) {
    // Priority 1: existing translation that is valid and non-empty (use it as-is — NE DIRAJ POSTOJÉĆE!)
    if (
      existing.hasOwnProperty(masterKey) &&
      existing[masterKey] !== undefined &&
      existing[masterKey] !== null &&
      existing[masterKey] !== ''
    ) {
      // Check if it's one of the extra keys that should be translated
      if (extraTranslations[lang] && extraTranslations[lang].hasOwnProperty(masterKey)) {
        // ONLY translate if existing was English (corrupted_data was literally "Corrupted Data")
        // Per rule 5 "ne diraj postojeće prijevode koji već postoje u tim fajlovima i nisu dio ove izmjene" — BUT user says in point 2 find missing OR EMPTY. These are not empty but are untranslated English.
        // Per previous batches (checking summary): "Samo dodaj ono što nedostaje". Previous batches did NOT touch untranslated existing keys like edit_service:"Edit service". So we keep them as-is.
        clean[masterKey] = existing[masterKey];
        keptExisting++;
      } else {
        clean[masterKey] = existing[masterKey];
        keptExisting++;
      }
    } else if (bookingKeyMap.hasOwnProperty(masterKey)) {
      clean[masterKey] = newTranslations[lang][bookingKeyMap[masterKey]];
      missingFixed++;
    } else if (extraTranslations[lang] && extraTranslations[lang].hasOwnProperty(masterKey)) {
      clean[masterKey] = extraTranslations[lang][masterKey];
      translatedExtra++;
    } else {
      console.log('  [WARN] Unexpected missing key in ' + lang + ': ' + masterKey);
      allOK = false;
    }
  }

  const cleanKeys = Object.keys(clean);
  if (cleanKeys.length !== 266) {
    console.log('[' + lang.toUpperCase() + '] ❌ Count wrong: ' + cleanKeys.length + ' (expected 266)');
    allOK = false;
  } else {
    let orderOk = true;
    for (let i=0; i<266; i++) {
      if (cleanKeys[i] !== masterKeys[i]) { orderOk = false; break; }
    }
    console.log('[' + lang.toUpperCase() + '] ✅ keptExisting=' + keptExisting + ', missingFixed=' + missingFixed + ', translatedExtra=' + translatedExtra + ', TOTAL=' + cleanKeys.length + ', orderOK=' + orderOk);
    if (!orderOk) allOK = false;
  }

  // 2x JSON validation
  JSON.parse(JSON.stringify(clean, null, 4));
  fs.writeFileSync(path.join(process.cwd(), '_tmp_' + lang + '.json'), JSON.stringify(clean, null, 4) + '\n', 'utf8');
}

console.log(allOK ? '\n✅ ALL GENERATIONS OK' : '\n❌ SOME PROBLEMS');
