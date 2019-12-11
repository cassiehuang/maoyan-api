// api服务
const express = require('express');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const crypto = require('crypto');
const session = require('express-session');
const MongoDBStore = require('connect-mongodb-session')(session);


const app = express();
// parse POST body as json;
app.use(bodyParser.json());
app.use(cookieParser());

const store = new MongoDBStore({
  uri: 'mongodb://session:123456@cassiehuang.online:27017/connect_mongodb_session?authSource=admin',
  collection: 'mySessions'
});
/* // redis 存储
const store = new redisStore({
  host: '127.0.0.1',
  port: '6370',
  db: 0,
  port: '',
}); */
app.use(
  session({
    secret: 'my_session_secret',
    resave: true,
    saveUninitialized: false, //刚被创建没有被修改，是否保持到storage中
    secure: true,
    name: 'sid', //session id 的名字，默认是connect.id
    cookie: { maxAge: 60 * 1000 * 30, httpOnly: true }, //30分钟
    store: store,
  })
);

// mongo数据库
const Mongo = require('mongojs')
const Db = Mongo('admin:123456@cassiehuang.online:27017/maoyan?authSource=admin', ['admin', 'cinemas', 'films', 'ids', 'recommand', 'user'])
const Cinemas = Db.cinemas
const Films = Db.films
const Recommand = Db.recommand
const Admin = Db.admin
const User = Db.user
const Ids = Db.ids


app.all('*', function(req, res, next) {
  res.header('Access-Control-Allow-Origin', req.headers.origin); //允许所有源访问，如果前端做跨域，可知允许本站访问
  res.header('Access-Control-Allow-Credentials', 'true'); //允许带认证，即接收cookies
  res.header('Access-Control-Allow-Methods', '*');
  res.header('Access-Control-Allow-Headers', 'Content-Type,XFILENAME,XFILECATEGORY,XFILESIZE');
  next();
});

// status of database
Db.on('error', function (err) {
    console.log('database error', err)
})

Db.on('connect', function () {
    console.log('database connected')
})
// apis
app.post('/api/auth', (req, res) => {
  if (req.session.user) {
    res.end(JSON.stringify({ username: req.session.user.username, type: req.session.user.type }));
  } else {
    res.end(JSON.stringify({ isLogin: false }));
  }
});

app.post('/api/logout', (req, res) => {
  delete req.session;
  res.end("logout");
});

// 加密,可用随机产生的字符串
const salt1 = 'xyz';
const salt2 = 'abc';
app.post('/api/login/*', (req, res) => {
  let args = req.body;
  if (args.username && args.password) {
    args.password = crypto
      .createHash('md5')
      .update(salt1 + args.password + salt2)
      .digest('hex');
  } else {
    res.end(JSON.stringify({ status: -1, message: 'data error' }));
    return;
  }
  // const collection = req.url.indexOf('user') === -1 ? Admin : User;
  Admin.findOne(args, (err, people) => {
    if (err) return res.status(500).end(err);
    if (!people) return res.status(403).end(JSON.stringify({ code: -1, message: 'not matched' }));
    req.session.user = people;
    res.end(JSON.stringify({ username: people.username }));
  })
});

app.post('/api/admin/add', (req, res) => {
  Admin.findOne(req.body.data, (err, people) => {
    if (err) return res.status(500).end(err);
    if (!people) {
      Admin.save(req.body.data, (err, doc) => {
        if (err) return res.status(500).end(err);
        return res.end(doc);
      })
    }
    if (people) {
      return res.status(403).end(JSON.stringify({ code: -2, message: '该用户名已存在' }));
    }
  })
});
app.get('/api/admin/query', (req, res) => {
  Admin.find(JSON.parse(req.query.data), (err, peoples) => {
    if (err) return res.status(500).end(err);
    return res.end(JSON.stringify(peoples));
  })
});
app.post('/api/admin/delete', (req, res) => {
  Admin.remove(req.body.data, (err, data) => {
    if (err) return res.status(500).end(err);
    return res.end(data);
  })
});

//films
const queryFilms = (req, res, { hasCount = false, params = {}, limit = 12, skip = 0, sort = { time: -1 } } = {}) => {
  const p1 = new Promise((resolve, reject) => {
    Films.find(params).sort(sort).limit(limit).skip(skip).toArray((err, films) => {
      if (err) reject(err)
      resolve(films)
    })
  });

  const p2 = new Promise((resolve, reject) => {
    Films.count(params, (err, count) => {
      if (err) reject(err)
      resolve(count)
    })
  });
  if (!hasCount) {
    p1.then((value) => {
      res.end(JSON.stringify(value));
    }).catch(err => {
      res.status(500).end(err);
    });
    return;
  }
  Promise.all([p1,p2]).then((value) => {
    res.end(JSON.stringify({ data: value[0], count: value[1] }));
  }).catch((err) => {
    res.status(500).end(err);
  })
}

app.get('/api/films/online', (req, res) => {
  queryFilms(req, res, { params: { type: 1 }, hasCount: true });
});
app.get('/api/films/pre', (req, res) => {
  queryFilms(req, res, { params: { type: 2 }, hasCount: true });
});
app.get('/api/films/good', (req, res) => {
  const args = {
    params: { type: 1 },
    skip: 0,
    limit: 10,
    sort: { grade: -1 }
  }
  queryFilms(req, res, args);
});
app.get('/api/films/hot', (req, res) => {
  const args = {
    params: { type: 2 },
    skip: 0,
    limit: 10,
    sort: { peopleNum: -1 }
  }
  queryFilms(req, res, args);
});

app.get('/api/films/query', (req, res) => {
  let { params, pageNo = 1, pageSize = 30, sort } = req.query;
  let sortObj = { 'time': -1 };
  if (sort === 1) sortObj = { 'peopleNum': -1 }
  if (sort === 2) sortObj = { 'time': -1 }
  if (sort === 3) sortObj = { 'grade': -1 }
  queryFilms(req, res, { params: JSON.parse(params), hasCount: true, limit: parseInt(pageSize), skip: (pageNo - 1) * pageSize, sort: sortObj });
});

app.post('/films/add', (req, res) => {
  Ids.find({ name: 'films' }, (err, id) => {
    if (id) {
      Films.insert.save({ id: id.id, ...req.body.data }, (err, data) => {
        if (err) return res.status(500).end(err);
        return res.end(doc);
      })
    }
  })
});

// recommands
app.get('/api/recommand', (req, res) => {
  Recommand.find({ isShow: true }, (err, films) => {
    if (err) return res.status(500).end(err);
    return res.end(JSON.stringify(films));
  })
});


// cinemas
const queryCinemas = (req, res, { hasCount = false, params = {}, limit = 12, skip = 0 } = {}) => {
  const p1 = new Promise((resolve, reject) => {
    Cinemas.find(params).limit(limit).skip(skip).toArray((err, cinemas) => {
      if (err) reject(err)
      resolve(cinemas)
    })
  });

  const p2 = new Promise((resolve, reject) => {
    Cinemas.count(params, (err, count) => {
      if (err) reject(err)
      resolve(count)
    })
  });
  if (!hasCount) {
    p1.then((value) => {
      res.end(JSON.stringify(value));
    }).catch(err => {
      res.status(500).end(err);
    });
    return;
  }
  Promise.all([p1,p2]).then((value) => {
    res.end(JSON.stringify({ data: value[0], count: value[1] }));
  }).catch((err) => {
    res.status(500).end(err);
  })
}
app.get('/api/cinemas/query', (req, res) => {
  let { params, pageNo = 1, pageSize = 30 } = req.query;
  queryCinemas(req, res, { params: JSON.parse(params), hasCount: true, limit: parseInt(pageSize), skip: (pageNo - 1) * pageSize });
});

// search
app.get('/api/search', (req, res) => {
  let { keyword } = req.query;
  const p1 = new Promise((resolve, reject) => {
    Films.find({"title": { $regex: keyword }}, (err, films) => {
      if (err) reject(err)
      resolve(films.slice(0, 20));
    });
  })
  const p2 = new Promise((resolve, reject) => {
    Cinemas.find({"name": { $regex: keyword }}, (err, cinemas) => {
      if (err) reject(err)
      resolve(cinemas.slice(0, 20));
    });
  })
  Promise.all([p1, p2]).then((result) => {
    res.end(JSON.stringify({films: result[0], cinemas: result[1], people: []}));
  })
  .catch((err) => {
    res.status(500).end(err);
  })
})
app.listen(8001);
