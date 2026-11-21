import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const app=readFileSync(new URL("./App.jsx",import.meta.url),"utf8");

test("route components are lazy and do not enter the eager app graph",()=>{
  for(const component of [
    "AdminDashboard","MatchesView","MessagesView","PersonaRoute",
    "EmbeddedEditorial","ProfileEditor","PublicMemberProfile",
    "MatchQuestions","CommunityChat","QuickmatchView","PhotoManager"
  ]){
    assert.match(app,new RegExp("const "+component+"=lazy\\("),component);
    assert.doesNotMatch(app,new RegExp("import "+component+" from"),component);
  }
  assert.match(app,/const loadEditorial=\(\)=>import\("\.\/EditorialPages\.jsx"\)/);
  assert.match(app,/const loadAccounts=\(\)=>import\("\.\/AccountPages\.jsx"\)/);
});
test("pending route uses plain accessible content loading; animated heart arrow remains planned",()=>{
  assert.match(app,/<Suspense fallback=\{<RouteLoading\/>\}><Outlet \/><\/Suspense>/);
  assert.match(app,/<p role="status">Loading page…<\/p>/);
  assert.doesNotMatch(app,/animation:|heart.*arrow|loading-spinner/);
});
