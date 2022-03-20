var env = "dev";
var apiHost = "http://192.168.0.123:8080";
var imgUrlBase = "http://192.168.0.123/img/";
if (window.location.hostname.indexOf('motto.plus') != -1){
    env == "pro";
    apiHost = "https://api.motto.plus";
    imgUrlBase = "https://img.motto.plus/img/";

    // 判断非本地server时 http强制转换成https
    var targetProtocol = "https:";
    if (window.location.protocol != targetProtocol){
        window.location.href = targetProtocol + window.location.href.substring(window.location.protocol.length);
    }
}else{
    env == "dev";
    apiHost = "https://api.motto.plus";
    imgUrlBase = "https://img.motto.plus/img/";
}

let metaEl = document.querySelector('meta[name="viewport"]');
// alert(window.devicePixelRatio + "\nwindow.screen.width=" + window.screen.width);
var scale = 1 / window.devicePixelRatio;
if (window.devicePixelRatio > 2){
    scale = scale * 1.5;
}
// alert(scale);
if (metaEl != null)
metaEl.setAttribute('content', `width=device-width,initial-scale=${scale},maximum-scale=${scale},minimum-scale=${scale}`);


function toggleMenu() {
    var x = document.getElementById("menuLinks");
    if (x.style.display === "block") {
        x.style.display = "none";
    } else {
        x.style.display = "block";
    }
}