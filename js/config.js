var env = "pro";//"pro"
var apiHost = "http://192.168.0.123:8080";
var imgUrlBase = "http://192.168.0.123/img/";

if (env == "pro"){
    apiHost = "https://api.motto.plus";
    imgUrlBase = "https://motto-plus.oss-cn-shanghai.aliyuncs.com/img/";
}



let metaEl = document.querySelector('meta[name="viewport"]');
const scale = 1 / window.devicePixelRatio;
if (metaEl != null)
metaEl.setAttribute('content', `width=device-width,user-scalable=no,initial-scale=${scale},maximum-scale=${scale},minimum-scale=${scale}`);
