#!/bin/bash

./gradlew bundleRelease

cd ./app/build/outputs/bundle/release/

rm app.apks

java -jar /home/hades/tools/bundletool-all-1.5.0.jar build-apks --ks=~/Hades.jks --ks-key-alias=hadestechnologies --bundle=app-release.aab --output=./app.apks
java -jar /home/hades/tools/bundletool-all-1.5.0.jar install-apks --apks=./app.apks

cd ../../../../..

