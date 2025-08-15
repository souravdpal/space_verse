const { v4: uuidv4 } = require('uuid');

const express = require('express');
const router = express.Router();


router.post('/nums/uid',(req,res)=>{

   const myUUID = uuidv4();
   res.json({uid : myUUID})
   console.log(myUUID);
    
})




module.exports=router;


