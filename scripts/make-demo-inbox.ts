// Generates a demo HR inbox as .eml files into test-data/inbox/.
// Run after make-test-cvs.ts + to-pdf.ps1: npx tsx scripts/make-demo-inbox.ts
import { mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'
import nodemailer, { type SendMailOptions } from 'nodemailer'

const ROOT = join(__dirname, '..', 'test-data')
const OUT = join(ROOT, 'inbox')
const HR = 'Service RH <rh@atlasbank.ma>'
const cv = (f: string): { filename: string; path: string } => ({ filename: f, path: join(ROOT, 'cvs', f) })
const doc = (filename: string, text: string): { filename: string; content: string } => ({ filename, content: text })

const day = (d: number, h: number): Date => new Date(Date.UTC(2026, 9, 26 + d, h, 12))

const emails: (SendMailOptions & { date: Date })[] = [
  {
    from: 'Amina Haddad <amina.haddad@mail.com>',
    subject: 'Application – Credit Analyst position',
    date: day(4, 8),
    text: `Dear Hiring Team,

Please find attached my application for the Credit Analyst position advertised on LinkedIn. I have five years of experience analysing large corporate credit files at Citibank Maghreb and I am fluent in French, English and Arabic.

You will find my CV, my cover letter and a copy of my Master's diploma attached.

Kind regards,
Amina Haddad`,
    attachments: [
      cv('en-02-amina-haddad.pdf'),
      doc('Cover letter - Amina Haddad.txt', 'Dear Hiring Manager, I am writing to apply for the Credit Analyst role...'),
      doc('Diploma - Master Banking and Finance.txt', 'Al Akhawayn University - Master in Banking and Finance - 2019')
    ]
  },
  {
    from: 'Omar Tazi <omar.tazi@mail.ma>',
    subject: 'Candidature au poste d’analyste crédit',
    date: day(4, 9),
    text: `Bonjour,

Je me permets de vous adresser ma candidature pour le poste d'analyste crédit. Vous trouverez ci-joint mon CV.

Je vous enverrai mon diplôme et ma lettre de motivation dès que possible.

Cordialement,
Omar Tazi`,
    attachments: [cv('fr-04-omar-tazi.docx')]
  },
  {
    from: 'Karim El Mansouri <k.elmansouri@atlasbank.ma>',
    subject: 'URGENT - salaire d’octobre non reçu',
    date: day(4, 10),
    text: `Bonjour,

Mon salaire du mois d'octobre n'a toujours pas été versé sur mon compte alors que mes collègues l'ont reçu le 25. Mon loyer est prélevé demain matin et je risque des frais de rejet.

Pouvez-vous vérifier en urgence s'il y a un problème avec mon RIB ? Matricule 20417, agence Casa-Anfa.

Merci d'avance,
Karim El Mansouri`
  },
  {
    from: 'Sophie Martin <s.martin@atlasbank.ma>',
    subject: 'Leave request 18–22 November',
    date: day(3, 15),
    text: `Hi,

I'd like to request annual leave from Tuesday 18 to Saturday 22 November (4 working days). My manager Youssef has already agreed and Leila will cover my files.

Could you confirm how many leave days I will have left after this?

Thanks,
Sophie`
  },
  {
    from: 'Hamza Ouazzani <h.ouazzani@atlasbank.ma>',
    subject: 'Horaires de travail pendant le Ramadan',
    date: day(3, 11),
    text: `Bonjour,

Pouvez-vous me confirmer les horaires de travail applicables pendant le mois de Ramadan, et si le télétravail est possible le vendredi ?

Merci,
Hamza`
  },
  {
    from: 'Nadia Benjelloun <n.benjelloun@atlasbank.ma>',
    subject: 'RE: RE: RE: Renouvellement de mon CDD',
    date: day(2, 17),
    text: `Bonjour,

Merci pour votre retour. Pour résumer de mon côté : je souhaite être convertie en CDI, mon manager y est favorable, mais je n'ai toujours pas de réponse écrite et mon CDD se termine le 30 novembre. Pouvez-vous me dire où en est le dossier et quand je recevrai le nouveau contrat ?

Nadia

Le mar. 28 oct. 2026 à 10:02, Service RH <rh@atlasbank.ma> a écrit :
> Bonjour Nadia, votre demande a été transmise à la direction. Nous revenons vers vous rapidement.
>
> Le lun. 20 oct. 2026 à 16:40, Nadia Benjelloun a écrit :
>> Bonjour, je n'ai pas eu de retour concernant ma demande du 6 octobre. Mon manager, M. Alami, a confirmé par mail qu'il soutenait une conversion en CDI. Pouvez-vous relancer ?
>>
>> Le lun. 6 oct. 2026 à 09:15, Nadia Benjelloun a écrit :
>>> Bonjour, mon CDD de 12 mois arrive à échéance le 30 novembre 2026. Je souhaiterais savoir s'il est prévu de le renouveler ou de le convertir en CDI. J'ai atteint tous mes objectifs annuels (voir entretien de mi-année).`
  },
  {
    from: 'Youssef Lahlou <y.lahlou@atlasbank.ma>',
    subject: 'Attestation de travail pour visa – rendez-vous demain',
    date: day(4, 7),
    text: `Bonjour,

J'ai un rendez-vous au consulat demain à 9h pour mon visa et il me faut une attestation de travail récente avec mon salaire. Est-il possible de l'avoir aujourd'hui ?

Merci beaucoup,
Youssef Lahlou, Direction Financière`
  },
  {
    from: 'سعاد بنعلي <souad.benali@atlasbank.ma>',
    subject: 'استفسار حول التأمين الصحي',
    date: day(1, 9),
    text: `السلام عليكم،

أود الاستفسار عن كيفية إضافة ابني المولود حديثاً إلى التأمين الصحي التكميلي، وما هي الوثائق المطلوبة لذلك؟

شكراً جزيلاً،
سعاد بنعلي`
  },
  {
    from: 'خالد العمراني <khalid.amrani@mail.ma>',
    subject: 'طلب ترشيح لمنصب محلل ائتمان',
    date: day(4, 11),
    text: `السيدات والسادة،

يشرفني أن أتقدم بطلب ترشيحي لمنصب محلل ائتمان. تجدون رفقته سيرتي الذاتية ورسالة التحفيز.

مع خالص التحيات،
خالد العمراني`,
    attachments: [cv('ar-01-khalid-amrani.docx'), doc('رسالة التحفيز.txt', 'رسالة تحفيز لمنصب محلل ائتمان')]
  },
  {
    from: 'HR Weekly <news@hrweekly.example>',
    subject: 'This week in HR: 5 trends for 2027',
    date: day(0, 6),
    text: `Read this week's top stories: AI in recruitment, hybrid work policies, pay transparency rules and more. Unsubscribe at any time.`
  }
]

async function main(): Promise<void> {
  mkdirSync(OUT, { recursive: true })
  const t = nodemailer.createTransport({ streamTransport: true, buffer: true, newline: 'windows' })
  for (const [i, e] of emails.entries()) {
    const info = await t.sendMail({ to: HR, ...e })
    writeFileSync(join(OUT, `${String(i + 1).padStart(2, '0')}.eml`), info.message as Buffer)
  }
  console.log(`wrote ${emails.length} emails to ${OUT}`)
}
main()
