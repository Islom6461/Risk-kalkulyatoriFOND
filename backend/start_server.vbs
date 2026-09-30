' ZA_ISLAMIC backend — yashirin (minimallashtirilgan) ishga tushirish
' Startup papkasidan chaqiriladi. Konsol oynasi ko'rinmasin.
Set shell = CreateObject("WScript.Shell")
base = Left(WScript.ScriptFullName, InStrRev(WScript.ScriptFullName, "\"))
shell.CurrentDirectory = base
' 3 sekund kutib, eski nusxani to'xtatamiz (ikki marta ishga tushsa)
WScript.Sleep 3000
shell.Run "cmd /c taskkill /FI ""WINDOWTITLE eq ZA_ISLAMIC Backend*"" /T /F", 0, False
WScript.Sleep 1000
shell.Run "python """ & base & "app.py""", 0, False