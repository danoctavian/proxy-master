sudo apt-get update ;
sudo apt-get install dialog apt-utils -y;
sudo apt-get -y install git ;
sudo apt-get -y install curl ;
sudo apt-get -y install python-software-properties ;
curl -sL https://deb.nodesource.com/setup_8.x | sudo -E bash - ;
sudo apt-get -y install nodejs ;
npm install -g pm2;
if [ -d "proxy-master" ]; then
  echo "proxy-master directory already exists. git pull only will be executed.";
  cd proxy-master;
  git pull origin master;
else
  echo "proxy-master directory does not exist. cloning from scratch.";
  git clone https://github.com/danoctavian/proxy-master.git ;
  cd proxy-master ;
fi
npm install;
pm2 stop app
pm2 start app -- $@