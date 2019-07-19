
const getopts = require('getopts');
const dedent = require('dedent');
const chalk = require('chalk'); 
const puppeteer = require('puppeteer');
const { PendingXHR } = require('pending-xhr-puppeteer');

const maxTimeourtForIframeRender = 60000;
const renderTime = 3000;
const reportApiUrl = 'report/template';
const iframeName = 'Dashboard';
const locale = 'zh-TW';

const unknownFlags = [];
const flags = getopts(process.argv.slice(2), {
  alias: {
    domain:['domain'],
    file: ['file'],
    // index: ['index'],
    from_datetime:['from'],
    to_datetime:['to'],
    timezone:['timezone'],
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
if(!flags.domain){
  print_error("--domain")
}
if(!flags.file){
  print_error("--file")
}
if(!flags.timezone){
  print_error("--timezone")
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
if(!flags.path){
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
          --domain                 {dim kibana report server domain}
          --file                   {dim report template file name e.g. template1.html}
          --timezone               {dim timezone in report_settings e.g. 'Asia/Taipei'}
          --from                   {dim kibana from date e.g. 2019-06-24T03:39:54.907Z}
          --to                     {dim kibana from date e.g. 2019-06-24T03:54:54.907Z}
          --out-path               {dim output relative path }
      `) + '\n'
    );
  }else{
    console.log(
      dedent(chalk`
  
      example: node index.js --domain=https://192.168.28.152:443 --file=9e07dde0-a934-11e9-9f12-3b88609bd6fa.html --timezone=Asia/Taipei --from=2019-06-24T03:39:54.907Z --to=2019-06-24T03:54:54.907Z --out-path=test2.pdf
  
      options:
      --domain                {dim kibana domain e.g. https://192.168.28.152}
      -f or -file             {dim report template file name e.g. template1.html}
      --timezone              {dim timezone in report_settings e.g. 'Asia/Taipei'}
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

    page.setDefaultTimeout(60000);
    // page.on('console', msg => console.log('PAGE LOG:', msg.text()));
    console.log("before navigate...");
    const crawler_url = flags.domain+'/'+reportApiUrl+'/'+flags.file+'?'
    // +'index='+flags.index+'&'+"from_date="+flags.from_datetime+"&to_date="+flags.to_datetime+'&title='+flags.title;
    console.log(crawler_url);
    await page.goto( crawler_url , {waitUntil: 'networkidle0'});
    // log in
    
    console.log("before log in...");
    await page.waitForSelector('[name="username"]');
    await page.type('[name="username"]','elastic');
    await page.type('[name="password"]','bara888');
 

    const [response] = await Promise.all([
      page.waitForNavigation("networkidle0"), // The promise resolves after navigation has finished
      page.click('button'), // Clicking the link will indirectly cause a navigation
    ]);
    console.log('it has logged in...........');

  
    //get main frame and iframe for debug
    let frames =  page.frames();
    console.log("-------------------frames:---------------------------");
    console.log("qty:"+frames.length);
    console.log("-----------------------------------------------------");

    //reload iframe with the specified time
    const timeParam = "&_g=(time:(from:'"+flags.from_datetime+"',mode:absolute,to:'"+flags.to_datetime+"'))";
    let iframesHandlers = await page.$$('iframe');
    
    for(let iframeHandler of iframesHandlers){
      await page.evaluate((iframe,timeParam)=>{
        console.log("before")
        console.log(iframe.src)
        iframe.src += timeParam;
        console.log("after-------")
        console.log(iframe.src)
      },iframeHandler,timeParam);
    }    

    await waitForAjaxRequest(page);
    console.log("Promise.race() has been resolved");

    await page.waitFor(renderTime);

    //set time
    const fromTime = new Date(flags.from_datetime).toLocaleString(locale,{timeZone:flags.timezone});
    console.log(fromTime)
    const toTime = new Date(flags.to_datetime).toLocaleString(locale,{timeZone:flags.timezone});
    console.log(toTime)
    await page.$$eval('div.ql-editor',(elements,from,to)=>{
      
      console.log("------------div.ql-editor--------------")
      // console.log(elements)
      // console.log(from);
      // console.log(to);
      let stReg = /{ST[^ST{}]*}/g;
      let etReg = /{ET[^ST{}]*}/g;
      elements.forEach((ele,index)=>{
          console.log("--------------------------------")
          if(ele.innerHTML.match(stReg)){
            ele.innerHTML = ele.innerHTML.replace(stReg,from);
          }
          if(ele.innerHTML.match(etReg)){
            ele.innerHTML = ele.innerHTML.replace(etReg,to);
          }
      });
    },fromTime,toTime)



    for(let iframe of frames){
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

          //put into the next tick so that the next request can be handle beforehand
          setTimeout(async()=>{
            await pendingXHR.waitForAllXhrFinished();
            resolve();
          },0);
          
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





