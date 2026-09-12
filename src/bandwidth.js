'use strict';
// Read-only logical-payload accounting. Never retains payload text or objects.
((root)=>{
  function create(now=()=>performance.now()) {
    const windowSeconds=20, encoder=new TextEncoder();
    let started=now(), samples={state:[],input:[]};
    function prune(time) {
      for(const list of Object.values(samples)) {
        let count=0;while(count<list.length&&list[count].time<=time-windowSeconds*1000)count++;
        if(count)list.splice(0,count);
      }
    }
    return {
      reset(){started=now();samples={state:[],input:[]};},
      record(kind,json){
        if(kind!=='state'&&kind!=='input')return;
        const time=now();prune(time);
        samples[kind].push({time,bytes:encoder.encode(json).length});
      },
      diagnostics(){
        const time=now();prune(time);
        const observedSeconds=Math.min(windowSeconds,Math.max(0,(time-started)/1000));
        const result={windowSeconds,observedSeconds,
          measurement:'Local outgoing + incoming logical JSON, once per direction. P2P includes kind/data; LAN outgoing includes POST envelope, incoming is SSE data. Excludes fragmentation, headers, signaling, retransmissions; POST counts submissions, P2P counts fully queued messages. Decimal MB; relay is a payload-only estimate.'};
        for(const [kind,list] of Object.entries(samples)) {
          const bytes=list.reduce((sum,s)=>sum+s.bytes,0);
          const bytesPerSecond=observedSeconds?bytes/observedSeconds:0;
          result[kind]={messages:list.length,bytes,messagesPerSecond:observedSeconds?list.length/observedSeconds:0,
            bytesPerSecond,averageBytes:list.length?bytes/list.length:0,peakBytes:list.reduce((peak,s)=>Math.max(peak,s.bytes),0),
            estimatedMBPerHour:bytesPerSecond*3600/1e6};
        }
        const oneWay=result.state.estimatedMBPerHour+result.input.estimatedMBPerHour;
        result.relayEstimate={piDownloadMBPerHour:oneWay,piUploadMBPerHour:oneWay,piTotalMBPerHour:2*oneWay};
        return result;
      }
    };
  }
  root.CatBandwidth={create};
  if(typeof module!=='undefined')module.exports=root.CatBandwidth;
})(typeof window==='undefined'?globalThis:window);
