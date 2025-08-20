

@echo off
cd /d "C:\Users\alive\Desktop\기타\github\my-chat"



:: 현재 시간을 yyyyMMddHHmmss 형식으로 만들기
setlocal enabledelayedexpansion
set year=%date:~0,4%
set month=%date:~5,2%
set day=%date:~8,2%
set hour=%time:~0,2%
if "%hour:~0,1%"==" " set hour=0%hour:~1,1%
set minute=%time:~3,2%
set second=%time:~6,2%
set commitmsg=%year%%month%%day%%hour%%minute%%second%

git add .
git commit -m "%commitmsg%"
git push

echo 커밋 완료: %commitmsg%
pause

