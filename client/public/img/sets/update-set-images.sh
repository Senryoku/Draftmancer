#! /bin/bash

count=$(ls -l | grep svg | wc -l)
echo "Starting with $count svgs."
#rm -v !(ana.svg|g18.svg|pana.svg|pdom.svg|pgrn.svg|prix.svg|sld.svg|update-set-images.sh) *.svg
#echo "Removed old svgs"
curl https://codeload.github.com/andrewgioia/Keyrune/zip/master -o master.zip
echo "Downloaded zip with svgs"
unzip master.zip 1>/dev/null
mv Keyrune-master/svg/*.svg .
echo "Moved svgs out of zip"
rm -rf Keyrune-master
rm -f master.zip
echo "Cleaned up other files"
sed -i "" 's/width=".*" h/width="32" h/;s/fill="#444"//' *.svg
echo "Edited svgs to 32px width and white fill"
count=$(ls -l | grep svg | wc -l)
echo "Finished with $count svgs."
