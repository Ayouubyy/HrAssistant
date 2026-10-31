// Generates fake CVs (DOCX), job descriptions and a demo inbox into test-data/.
// Run: npx tsx scripts/make-test-cvs.ts   (then scripts/to-pdf.ps1 for PDF copies)
import { mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'
import { AlignmentType, Document, HeadingLevel, Packer, Paragraph, TextRun } from 'docx'

interface Cv {
  file: string
  rtl?: boolean
  name: string
  title: string
  contact: string
  sections: [string, string[]][]
}

const OUT = join(__dirname, '..', 'test-data')

const cvs: Cv[] = [
  {
    file: 'fr-01-yasmine-alaoui.docx',
    name: 'Yasmine Alaoui',
    title: 'Analyste crédit senior',
    contact: 'Casablanca · yasmine.alaoui@mail.ma · +212 6 12 34 56 78',
    sections: [
      ['Expérience', [
        "2019–2025 · Analyste crédit senior, Attijariwafa Bank, Casablanca : analyse financière de dossiers PME et grandes entreprises (portefeuille de 1,2 Md MAD), notation interne, rédaction des notes au comité de crédit, suivi des engagements sensibles.",
        "2017–2019 · Analyste risques, BMCE Bank : calcul des provisions IFRS 9, stress tests, reporting Bâle III à Bank Al-Maghrib."
      ]],
      ['Formation', ['Master Finance et Banque, ISCAE Casablanca (2017)', 'Licence Économie, Université Hassan II (2015)']],
      ['Compétences', ['Analyse financière, IFRS 9, Bâle III, KYC/AML, Excel avancé, VBA, Power BI']],
      ['Langues', ['Français (courant), Arabe (langue maternelle), Anglais (professionnel)']]
    ]
  },
  {
    file: 'fr-02-mehdi-bennani.docx',
    name: 'Mehdi Bennani',
    title: 'Chargé de clientèle entreprises',
    contact: 'Rabat · mehdi.bennani@mail.ma · +212 6 98 76 54 32',
    sections: [
      ['Expérience', [
        "2021–2025 · Chargé de clientèle entreprises, CIH Bank : montage de dossiers de crédit d'investissement, analyse des bilans, négociation des garanties.",
        '2020–2021 · Stagiaire analyste, Deloitte Maroc : audit financier.'
      ]],
      ['Formation', ['Master Finance, ENCG Settat (2020)']],
      ['Compétences', ['Analyse de bilans, montage de crédits, Excel, notions IFRS']],
      ['Langues', ['Français (courant), Arabe (natif), Anglais (intermédiaire)']]
    ]
  },
  {
    file: 'fr-03-sara-idrissi.docx',
    name: 'Sara Idrissi',
    title: 'Chargée de marketing digital',
    contact: 'Marrakech · sara.idrissi@mail.ma · +212 6 11 22 33 44',
    sections: [
      ['Expérience', [
        '2020–2025 · Chargée de marketing digital, agence Pixel : campagnes réseaux sociaux, SEO, gestion de budgets publicitaires.',
        "2018–2020 · Assistante communication, Office du tourisme."
      ]],
      ['Formation', ['Master Marketing digital, ESCA (2018)']],
      ['Compétences', ['Google Ads, Meta Ads, SEO, Canva, analyse de données marketing']],
      ['Langues', ['Français (courant), Arabe (natif), Anglais (courant)']]
    ]
  },
  {
    file: 'fr-04-omar-tazi.docx',
    name: 'Omar Tazi',
    title: 'Analyste financier junior',
    contact: 'Tanger · omar.tazi@mail.ma · +212 6 55 44 33 22',
    sections: [
      ['Expérience', [
        "2024–2025 · Analyste financier junior, Société Générale Maroc : préparation des analyses financières des dossiers de crédit PME, collecte des états de synthèse.",
        '2023 · Stage de fin d’études, Bank of Africa : analyse de risque de contrepartie.'
      ]],
      ['Formation', ['Master Finance d’entreprise, FSJES Tanger (2023)']],
      ['Compétences', ['Analyse financière, Excel, IFRS (bases), Python (bases)']],
      ['Langues', ['Français (courant), Arabe (natif), Espagnol (courant)']]
    ]
  },
  {
    file: 'en-01-james-carter.docx',
    name: 'James Carter',
    title: 'Credit Risk Analyst',
    contact: 'London · james.carter@mail.co.uk · +44 7700 900123',
    sections: [
      ['Experience', [
        '2018–2025 · Credit Risk Analyst, HSBC, London: corporate credit reviews, internal rating models, IFRS 9 expected credit loss, Basel III capital reporting.',
        '2016–2018 · Junior Analyst, Barclays: financial spreading and covenant monitoring.'
      ]],
      ['Education', ['MSc Finance, London School of Economics (2016)']],
      ['Skills', ['Credit analysis, IFRS 9, Basel III, SQL, Excel, Moody’s RiskCalc']],
      ['Languages', ['English (native), Spanish (basic)']]
    ]
  },
  {
    file: 'en-02-amina-haddad.docx',
    name: 'Amina Haddad',
    title: 'Credit Analyst',
    contact: 'Casablanca · amina.haddad@mail.com · +212 6 70 80 90 10',
    sections: [
      ['Experience', [
        '2020–2025 · Credit Analyst, Citibank Maghreb: analysis of large corporate credit files, cash-flow modelling, credit committee memos, AML/KYC checks.',
        '2019–2020 · Audit Associate, PwC Casablanca.'
      ]],
      ['Education', ['Master in Banking and Finance, Al Akhawayn University (2019)']],
      ['Skills', ['Financial analysis, IFRS, Basel III, AML/KYC, Excel, Power BI']],
      ['Languages', ['English (fluent), French (fluent), Arabic (native)']]
    ]
  },
  {
    file: 'en-03-daniel-kim.docx',
    name: 'Daniel Kim',
    title: 'Software Engineer',
    contact: 'Berlin · daniel.kim@mail.de · +49 151 2345678',
    sections: [
      ['Experience', [
        '2019–2025 · Backend Engineer, N26: Java and Kotlin microservices, Spring Boot, PostgreSQL, Kafka, payments platform.',
        '2017–2019 · Java Developer, SAP.'
      ]],
      ['Education', ['BSc Computer Science, TU Berlin (2017)']],
      ['Skills', ['Java, Kotlin, Spring Boot, Kafka, PostgreSQL, Docker, Kubernetes, AWS']],
      ['Languages', ['English (fluent), German (fluent), Korean (native)']]
    ]
  },
  {
    file: 'en-04-laura-mendes.docx',
    name: 'Laura Mendes',
    title: 'Risk Analyst',
    contact: 'Lisbon · laura.mendes@mail.pt · +351 912 345 678',
    sections: [
      ['Experience', [
        '2021–2025 · Risk Analyst, Millennium BCP: retail credit scoring, portfolio monitoring, IFRS 9 staging.',
        '2020–2021 · Data Analyst intern, Deloitte.'
      ]],
      ['Education', ['MSc Economics, Nova SBE (2020)']],
      ['Skills', ['Credit scoring, IFRS 9, SAS, Python, SQL']],
      ['Languages', ['Portuguese (native), English (fluent)']]
    ]
  },
  {
    file: 'ar-01-khalid-amrani.docx',
    rtl: true,
    name: 'خالد العمراني',
    title: 'محلل ائتمان',
    contact: 'فاس · khalid.amrani@mail.ma · 0612131415',
    sections: [
      ['الخبرة المهنية', [
        '2018–2025 · محلل ائتمان، البنك الشعبي، فاس: تحليل الملفات الائتمانية للشركات الصغيرة والمتوسطة، إعداد مذكرات لجنة الائتمان، تقييم الضمانات ومتابعة المخاطر.',
        '2016–2018 · مساعد محلل مالي، بنك المغرب للتجارة الخارجية.'
      ]],
      ['التكوين', ['ماستر في المالية والبنوك، جامعة سيدي محمد بن عبد الله (2016)']],
      ['المهارات', ['التحليل المالي، المعيار الدولي IFRS 9، اتفاقية بازل 3، مكافحة غسل الأموال، Excel']],
      ['اللغات', ['العربية (اللغة الأم)، الفرنسية (بطلاقة)، الإنجليزية (متوسط)']]
    ]
  },
  {
    file: 'ar-02-fatima-zahra-bouzid.docx',
    rtl: true,
    name: 'فاطمة الزهراء بوزيد',
    title: 'مراقبة مالية',
    contact: 'الرباط · fz.bouzid@mail.ma · 0622334455',
    sections: [
      ['الخبرة المهنية', [
        '2020–2025 · مراقبة مالية، مجموعة صناعية: إعداد الميزانيات، مراقبة التكاليف، التقارير الشهرية للإدارة.',
        '2019–2020 · محاسبة، مكتب خبرة محاسبية.'
      ]],
      ['التكوين', ['ماستر في المحاسبة والمراقبة والتدقيق، المدرسة الوطنية للتجارة والتسيير (2019)']],
      ['المهارات', ['المحاسبة العامة، مراقبة التسيير، IFRS، SAP، Excel']],
      ['اللغات', ['العربية (اللغة الأم)، الفرنسية (بطلاقة)، الإنجليزية (جيد)']]
    ]
  },
  {
    file: 'ar-03-youssef-chraibi.docx',
    rtl: true,
    name: 'يوسف الشرايبي',
    title: 'مسؤول مبيعات',
    contact: 'أكادير · youssef.chraibi@mail.ma · 0633445566',
    sections: [
      ['الخبرة المهنية', [
        '2017–2025 · مسؤول مبيعات، شركة توزيع: إدارة فريق من 8 مندوبين، تحقيق أهداف المبيعات، التفاوض مع كبار العملاء.'
      ]],
      ['التكوين', ['دبلوم تقني متخصص في التجارة (2016)']],
      ['المهارات', ['التفاوض، إدارة الفرق، خدمة العملاء، Excel']],
      ['اللغات', ['العربية (اللغة الأم)، الفرنسية (متوسط)']]
    ]
  },
  {
    file: 'ar-04-nadia-elfassi.docx',
    rtl: true,
    name: 'نادية الفاسي',
    title: 'محللة مخاطر ائتمانية أولى',
    contact: 'الدار البيضاء · nadia.elfassi@mail.ma · 0644556677',
    sections: [
      ['الخبرة المهنية', [
        '2016–2025 · محللة مخاطر ائتمانية أولى، القرض الفلاحي للمغرب: تحليل ملفات تمويل الشركات الكبرى، نماذج التنقيط الداخلي، احتساب المخصصات وفق IFRS 9، تقارير بازل 3 لبنك المغرب.',
        '2014–2016 · محللة مالية، شركة تأمين.'
      ]],
      ['التكوين', ['ماستر في الهندسة المالية، المعهد العالي للتجارة وإدارة المقاولات (2014)']],
      ['المهارات', ['تحليل الائتمان، IFRS 9، بازل 3، KYC، SQL، Power BI']],
      ['اللغات', ['العربية (اللغة الأم)، الفرنسية (بطلاقة)، الإنجليزية (بطلاقة)']]
    ]
  }
]

function buildDocx(cv: Cv): Document {
  const align = cv.rtl ? AlignmentType.RIGHT : AlignmentType.LEFT
  const p = (text: string, opts: { bold?: boolean; size?: number; heading?: (typeof HeadingLevel)[keyof typeof HeadingLevel] } = {}): Paragraph =>
    new Paragraph({
      alignment: align,
      bidirectional: cv.rtl,
      heading: opts.heading,
      spacing: { after: 120 },
      children: [new TextRun({ text, bold: opts.bold, size: opts.size, rightToLeft: cv.rtl, font: 'Calibri' })]
    })
  return new Document({
    sections: [
      {
        children: [
          p(cv.name, { bold: true, size: 36 }),
          p(cv.title, { size: 26 }),
          p(cv.contact, { size: 20 }),
          ...cv.sections.flatMap(([h, lines]) => [p(h, { heading: HeadingLevel.HEADING_2 }), ...lines.map((l) => p(l))])
        ]
      }
    ]
  })
}

const jobs = {
  'credit-analyst-fr.txt': `Analyste crédit (H/F) — Banque, Casablanca

Au sein de la Direction des Engagements, vous analysez les demandes de crédit des entreprises (PME et grandes entreprises) et formulez un avis argumenté au comité de crédit.

Missions :
- Analyse financière des dossiers de crédit (bilans, flux de trésorerie, ratios)
- Évaluation des risques et des garanties, notation interne
- Rédaction des notes de crédit et présentation au comité
- Suivi du portefeuille et des engagements sensibles
- Respect des exigences réglementaires (Bâle III, IFRS 9, KYC/AML)

Profil recherché :
- Diplôme Bac+5 en finance, banque ou économie (obligatoire)
- Au moins 2 ans d'expérience en analyse crédit ou risques bancaires (obligatoire)
- Maîtrise du français écrit et oral (obligatoire)
- Connaissance de IFRS 9 et Bâle III
- Excel avancé ; Power BI ou VBA appréciés
- Rigueur, sens de la confidentialité`,
  'java-developer-en.txt': `Senior Java Developer — Fintech, remote-friendly

You'll build and run the backend services behind our payments platform.

Responsibilities:
- Design and build Java / Spring Boot microservices
- Work with Kafka event streams and PostgreSQL
- Own services in production on Kubernetes (AWS)

Requirements:
- 4+ years of professional Java experience (required)
- Spring Boot (required)
- Kafka or another message broker
- PostgreSQL or another relational database
- Docker and Kubernetes
- English (required)`
}

mkdirSync(join(OUT, 'cvs'), { recursive: true })
mkdirSync(join(OUT, 'jobs'), { recursive: true })
for (const [name, text] of Object.entries(jobs)) writeFileSync(join(OUT, 'jobs', name), text)

Promise.all(
  cvs.map(async (cv) => writeFileSync(join(OUT, 'cvs', cv.file), await Packer.toBuffer(buildDocx(cv))))
).then(() => console.log(`wrote ${cvs.length} CVs and ${Object.keys(jobs).length} job descriptions to ${OUT}`))
