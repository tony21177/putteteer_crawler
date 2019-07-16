
const getopts = require('getopts');
const dedent = require('dedent');
const chalk = require('chalk'); 
const puppeteer = require('puppeteer');
const { PendingXHR } = require('pending-xhr-puppeteer');

const maxTimeourtForIframeRender = 60000;
const renderTime = 2000;
const reportApiUrl = 'report/template';

const unknownFlags = [];
const flags = getopts(process.argv.slice(2), {
  alias: {
    ip:['ip'],
    file: ['file'],
    // index: ['index'],
    from_datetime:['from'],
    to_datetime:['to'],
    // title:['title'],
    path:['out-path']
  },
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
// if(!flags.index){
//   print_error("--index")
// }
if(!flags.from_datetime){
  print_error("--from")
}
if(!flags.to_datetime){
  print_error("--to")
}
// if(!flags.title){
//   print_error("--title")
// }
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
          --from                   {dim kibana from date e.g. 2019-06-24T03:39:54.907Z}
          --to                     {dim kibana from date e.g. 2019-06-24T03:54:54.907Z}
          --out-path               {dim output relative path }
      `) + '\n'
    );
  }else{
    console.log(
      dedent(chalk`
  
      example: node index.js --ip=192.168.28.152 --file=template1.html --from=2019-06-24T03:39:54.907Z --to=2019-06-24T03:54:54.907Z --out-path=test2.pdf
  
      options:
      -f or -file             {dim report template file name e.g. template1.html}
      -from                   {dim kibana from date e.g. 2019-06-24T03:39:54.907Z}
      -to                     {dim kibana from date e.g. 2019-06-24T03:54:54.907Z}
      --out-path              {dim output relative path }
      `) + '\n'
    );
  }

  process.exit(1);
}

var timeoutObj;
(async () => {
  var page;
  try{
    const browser = await puppeteer.launch({headless:true,args:['--no-sandbox','--ignore-certificate-errors'],timeout:30000});
    console.log("-------------------launch--broser-------------------------");
    page = await browser.newPage();

    page.setDefaultTimeout(15000);
    // page.on('console', msg => console.log('PAGE LOG:', msg.text()));
    console.log("before navigate...");
    const crawler_url = 'https://'+flags.ip+'/'+reportApiUrl+'/'+flags.file+'?'+'index='+flags.index+'&'+
    "from_date="+flags.from_datetime+"&to_date="+flags.to_datetime+'&title='+flags.title;
    await page.goto( crawler_url , {waitUntil: 'networkidle2'});
    // log in
    console.log(crawler_url);
    console.log("before log in...");
    await page.waitForSelector('[name="username"]');
    await page.type('[name="username"]','elastic');
    await page.type('[name="password"]','bara888');
 

    const [response] = await Promise.all([
      page.waitForNavigation("networkidle0"), // The promise resolves after navigation has finished
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

    await iframe.waitForSelector('.dshDashboardViewport-withMargins')
    

    await waitForAjaxRequest(page);
    console.log("Promise.race() has been resolved");

    

    await page.waitFor(renderTime);

    let filterHandle = await iframe.$('.filter-bar.filter-panel');
    if(filterHandle){
      console.log("has filter element")
       await iframe.evaluate(()=>{
        //the document is for iframe in browser context
        //this is in sandbox,so console will not print out directly,need to open line 112 or check in browser dev tool
        let filters = document.querySelectorAll('.filter-bar.filter-panel');
        for(let filter of filters){
          console.log(filter)
          filter.style.display = 'none'
        }
      })

    }
    await page.pdf({path: flags.path, format: 'A4'});
    console.log("pdf has already been printed out");
    await browser.close();
    console.log("Headless browser has already been closed");
    process.exit(0);
  }catch(e){
    console.log("catch----")
    console.log(e);
    await page.pdf({path: flags.path, format: 'A4'});
    process.exit(1);
  }
})();

var waitForAjaxRequest = (page)=>{
  return Promise.race([iframeRenderMaxTimeout(maxTimeourtForIframeRender).timeoutPromise,ajaxForESData()]);

  //proxy ajax for msearch elasticsearch request
  function ajaxForESData(){
    return new Promise((resolve,reject)=>{
      const pendingXHR = new PendingXHR(page);
      page.on('request', async (request) => {
        if (request.resourceType() === 'xhr'&& request.url().includes('msearch')) {
          console.log(pendingXHR.pendingXhrCount());
          console.log(request.url());
          await page.waitForResponse(response => response.url().includes('msearch'),{timeout:60000});
          await pendingXHR.waitForAllXhrFinished();
          resolve();
          
        }
      });
    })
    
  }

  //timeout promise
  
  function iframeRenderMaxTimeout(delay){
    var timeoutPromise = new Promise( (resolve,reject)=>{
      timeoutObj=setTimeout( ()=>{
                              console.log("no ajax request finished for "+delay/1000+"s");
                              reject( "no ajax request finished for "+delay/1000+"s" );
                            }, delay );
      
      } );
      console.log("setting timeout for "+delay/1000+"s");

    return {
      timeoutObj:timeoutObj,
      timeoutPromise:timeoutPromise
    }
  }
}





