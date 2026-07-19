import { Hono } from 'hono';
import type { AppVariables } from '../../../../types';
import home from './home';
import social from './social';
import publicTimeline from './public';
import tag from './tag';
import list from './list';
import recommended from './recommended';

const app = new Hono<{ Variables: AppVariables }>();

app.route('/home', home);
app.route('/social', social);
app.route('/public', publicTimeline);
app.route('/tag', tag);
app.route('/list', list);
app.route('/recommended', recommended);

export default app;
