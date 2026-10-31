# Converts selected test CVs to PDF with Microsoft Word, and makes an empty PDF.
$root = Join-Path $PSScriptRoot '..\test-data'
$cvs = Resolve-Path (Join-Path $root 'cvs')
$word = New-Object -ComObject Word.Application
$word.Visible = $false
foreach ($n in @('fr-01-yasmine-alaoui', 'en-02-amina-haddad', 'ar-04-nadia-elfassi')) {
  $doc = $word.Documents.Open((Join-Path $cvs "$n.docx"))
  $doc.SaveAs([ref](Join-Path $cvs "$n.pdf"), [ref]17)
  $doc.Close()
  Remove-Item (Join-Path $cvs "$n.docx")
}
$blank = $word.Documents.Add()
$blank.SaveAs([ref](Join-Path (Resolve-Path $root) 'blank.pdf'), [ref]17)
$blank.Close([ref]0)
$word.Quit()
