#! /bin/bash

count=$(ls -l | grep svg | wc -l)
echo "Starting with $count svgs."
curl https://codeload.github.com/andrewgioia/Keyrune/zip/master -o master.zip
echo "Downloaded zip with svgs"
unzip master.zip 1>/dev/null
mv Keyrune-master/svg/*.svg .
echo "Moved svgs out of zip"
rm -rf Keyrune-master
rm -f master.zip
echo "Cleaned up other files"
sed -i "" 's/fill="#444"//' *.svg
echo "Making core symbols bigger"
sed -i "" 's/height=".*" viewBox="0 0 32 32">/height="16" viewBox="0 8 32 16">/' m[0-9][0-9].svg
echo "Edited svgs to 32px width and white fill"
count=$(ls -l | grep svg | wc -l)
echo "Finished with $count svgs."
