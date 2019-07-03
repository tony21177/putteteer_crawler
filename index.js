
const getopts = require('getopts');
const dedent = require('dedent');
const chalk = require('chalk'); 
const puppeteer = require('puppeteer');

const maxTimeourtForIframeRender = 60000;
const durationAfterFirstAjaxResponse = 2000;
const reportApiUrl = 'report/template';

const unknownFlags = [];
const flags = getopts(process.argv.slice(2), {
  alias: {
    ip:['ip'],
    file: ['file'],
    index: ['index'],
    from_datetime:['from'],
    to_datetime:['to'],
    title:['title'],
    path:['out-path']
  },
  // string: ["file","index","from","to","title"],
  default: {
    debug: true
  },
  unknown: (flag) => {
    unknownFlags.push(flag);
  }
});
// console.log(flags)
if (unknownFlags.length && !flags.help) {
  const pluralized = unknownFlags.length > 1 ? 'flags' : 'flag';
  console.log(chalk`\n{red Unknown ${pluralized}: ${unknownFlags.join(', ')}}\n`);
  flags.help = true;
}

if(process.argv.slice(2).length===0){
  print_error();
}
if(!flags.ip){
  print_error("--ip")
}
if(!flags.file){
  print_error("--file")
}
if(!flags.index){
  print_error("--index")
}
if(!flags.from_datetime){
  print_error("--from")
}
if(!flags.to_datetime){
  print_error("--to")
}
if(!flags.title){
  print_error("--title")
}
if(!flags.title){
  print_error("--out-path")
}


if (flags.help) {
  print_error();
}

function print_error(flag){
  if(flag){
    console.log(
      dedent(chalk`
  
        {red need }{blue ${flag}} {red argument}
  
        options:
          --ip                     {dim kibana report server ip}
          --file                   {dim report template file name e.g. template1.html}
          --index                  {dim kibana dashboard id}
          --from                   {dim kibana from date e.g. 2019-06-24T03:39:54.907Z}
          --to                     {dim kibana from date e.g. 2019-06-24T03:54:54.907Z}
          --title                  {dim report title e.g. deepvisible}
          --out-path               {dim output relative path }
      `) + '\n'
    );
  }else{
    console.log(
      dedent(chalk`
  
      example: node index.js --ip=192.168.28.152 --file=template1.html --index=c25973a0-90ea-11e9-af50-bd7e20ca8913 --from=2019-06-24T03:39:54.907Z --to=2019-06-24T03:54:54.907Z --title=deepvisible --out-path=test2.pdf
  
      options:
      -f or -file             {dim report template file name e.g. template1.html}
      -i or -index            {dim kibana dashboard id}
      -from                   {dim kibana from date e.g. 2019-06-24T03:39:54.907Z}
      -to                     {dim kibana from date e.g. 2019-06-24T03:54:54.907Z}
      -title                  {dim report title e.g. deepvisible}
      --out-path              {dim output relative path }
      `) + '\n'
    );
  }

  process.exit(1);
}


(async () => {
  try{
    const browser = await puppeteer.launch({args:['--no-sandbox','--ignore-certificate-errors'],timeout:30000});
    console.log("-------------------launch--broser-------------------------");
    const page = await browser.newPage();
    page.setDefaultTimeout(15000);
    // await page.setViewport({width:1903,height:1393});
    // page.on('console', msg => console.log('PAGE LOG:', msg.text()));
    console.log("before navigate...");
    const crawler_url = 'https://'+flags.ip+'/'+reportApiUrl+'/'+flags.file+'?'+'index='+flags.index+'&'+
    "from_date="+flags.from_datetime+"&to_date="+flags.to_datetime+'&title='+flags.title;
    console.log(crawler_url);
    await page.goto( crawler_url , {waitUntil: 'networkidle2'});
    // log in
    console.log(crawler_url);
    console.log("before log in...");
    await page.waitForSelector('[name="username"]');
    await page.type('[name="username"]','elastic');
    await page.type('[name="password"]','bara888');
 

    const [response] = await Promise.all([
      page.waitForNavigation(), // The promise resolves after navigation has finished
      page.click('button'), // Clicking the link will indirectly cause a navigation
    ]);
    console.log('login in...........');
  
    //get main frame and iframe for debug
    let frames =  page.frames();
    console.log("-------------------frames:---------------------------");
    console.log("qty:"+frames.length);
    console.log("-----------------------------------------------------");
    let mainFrame = frames[0];
    let iframe = frames[1]
    console.log("iframe id:"+iframe._name); 
    
    iframe.waitForNavigation({waitUntil: 'networkidle2'});
    await iframe.waitForSelector('.dshDashboardViewport-withMargins')
    

    await waitForAjaxRequest(page);
    console.log("Promise.race() has been resolved");
    await page.waitFor(durationAfterFirstAjaxResponse);
    await page.pdf({path: flags.path, format: 'A4'});
    console.log("pdf has already been printed out");
    await browser.close();
    console.log("Headless browser has already been closed");
    process.exit(0);
  }catch(e){
    console.log(e);
    await browser.close();
    process.exit(1);
  }
})();

var waitForAjaxRequest = (page)=>{
  return Promise.race([iframeRenderMaxTimeout(maxTimeourtForIframeRender).timeoutPromise,ajaxRequestFinished()]);
  // var p1 = iframeRenderMaxTimeout(maxTimeourtForIframeRender).timeoutPromise;
  // var p2 = ajaxRequestFinished();
  // var pAll = Promise.race([p1,p2]);
  // console.log(p1)
  // console.log(p2)
  // console.log(pAll)
  // return pAll

  
  //some ajax promise
  function ajaxRequestFinished(){
    return new Promise(function(resolve,reject){
      console.log("register ajax requestfinished event")
      page.once('requestfinished', function(){
        console.log("one ajax request finished")
        resolve();
        //need to clear the timer,or the program will only terminate until all timer or IO all finished
        clearTimeout(timeoutObj);
      });
    });
    
  } 
  //timeout promise
  var timeoutObj;
  function iframeRenderMaxTimeout(delay){
    var timeoutPromise = new Promise( (resolve,reject)=>{
      timeoutObj=setTimeout( ()=>{
                              console.log("no ajax request finished for "+delay/1000+"s");
                              reject( "Timeout!" );
                            }, delay );
      
      } );
      console.log("setting timeout for "+delay/1000+"s");

    return {
      timeoutObj:timeoutObj,
      timeoutPromise:timeoutPromise
    }
  }
}





